import { credit, debit, LedgerError } from '@monopay/ledger-core'
import type {
  AssetView,
  AssetsRequest,
  BankCollectRequest,
  BankPayRequest,
  BankruptRequest,
  BankSummary,
  PayRequest,
  RankingEntry,
  RefundRequest,
  ReverseRequest,
  SalaryRequest,
  SettlementView,
  TransactionCategory,
  TransactionFilter,
  TransactionPage,
  TransactionView,
} from '@monopay/shared'
import { and, desc, eq, lt, or } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { db } from '../db'
import {
  assetSnapshots,
  players,
  roomEvents,
  rooms,
  settlements,
  transactions,
  type RoomStatus,
  type TransactionStatus,
} from '../db/schema'
import { AppError } from '../lib/errors'
import type { AuthContext } from './service'

type PlayerRow = typeof players.$inferSelect
type TransactionRow = typeof transactions.$inferSelect

const PLAYER_CATEGORIES = new Set<TransactionCategory>([
  'rent',
  'purchase',
  'tax',
  'fine',
  'chance',
  'mortgage',
  'loan',
  'repay',
  'trade',
  'other',
])

const BANK_PAY_CATEGORIES = new Set<TransactionCategory>([
  'salary',
  'chance',
  'mortgage',
  'correction',
  'other',
])

const BANK_COLLECT_CATEGORIES = new Set<TransactionCategory>([
  'tax',
  'fine',
  'purchase',
  'correction',
  'other',
])

function playerNameMap(roomId: string): Map<string, string> {
  const rows = db
    .select({ id: players.id, nickname: players.nickname })
    .from(players)
    .where(eq(players.roomId, roomId))
    .all()
  return new Map(rows.map((row) => [row.id, row.nickname]))
}

function toTransactionView(row: TransactionRow, names: Map<string, string>): TransactionView {
  return {
    id: row.id,
    seq: row.seq,
    fromType: row.fromType,
    refundOf: row.refundOf,
    reversalOf: row.reversalOf,
    fromPlayerId: row.fromPlayerId,
    fromName:
      row.fromType === 'bank'
        ? '银行'
        : ((row.fromPlayerId ? names.get(row.fromPlayerId) : null) ?? '未知玩家'),
    toType: row.toType,
    toPlayerId: row.toPlayerId,
    toName:
      row.toType === 'bank'
        ? '银行'
        : ((row.toPlayerId ? names.get(row.toPlayerId) : null) ?? '未知玩家'),
    amount: row.amount,
    balanceAfterFrom: row.balanceAfterFrom,
    balanceAfterTo: row.balanceAfterTo,
    category: row.category as TransactionCategory,
    note: row.note,
    status: row.status as TransactionStatus,
    createdAt: row.createdAt.toISOString(),
  }
}

export function getRecentTransactions(roomId: string, limit = 20): TransactionView[] {
  const rows = db
    .select()
    .from(transactions)
    .where(eq(transactions.roomId, roomId))
    .orderBy(desc(transactions.seq))
    .limit(limit)
    .all()
  const names = playerNameMap(roomId)
  return rows.map((row) => toTransactionView(row, names))
}

export function getBankSummary(roomId: string): BankSummary {
  const rows = db
    .select({
      fromType: transactions.fromType,
      toType: transactions.toType,
      amount: transactions.amount,
      status: transactions.status,
      refundOf: transactions.refundOf,
      reversalOf: transactions.reversalOf,
    })
    .from(transactions)
    .where(and(eq(transactions.roomId, roomId), eq(transactions.status, 'success')))
    .all()

  let issued = 0
  let collected = 0

  for (const row of rows) {
    // Refund/reversal rows cancel their original; keeping either would double count.
    if (row.refundOf || row.reversalOf) continue
    if (row.fromType === 'bank' && row.toType === 'player') {
      issued += row.amount
    }
    if (row.fromType === 'player' && row.toType === 'bank') {
      collected += row.amount
    }
  }

  return { issued, collected, net: issued - collected }
}

function assertCategory(category: TransactionCategory, allowed: Set<TransactionCategory>): void {
  if (!allowed.has(category)) {
    throw new AppError('INVALID_ARGUMENT', '该类别不能用于这笔交易')
  }
}

function getPlayerInRoom(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  roomId: string,
  playerId: string,
): PlayerRow {
  const player = tx
    .select()
    .from(players)
    .where(and(eq(players.roomId, roomId), eq(players.id, playerId)))
    .get()

  if (!player || !player.isPlayer) {
    throw new AppError('INVALID_ARGUMENT', '玩家不存在或已不在本局')
  }

  return player
}

function assertDuplicateMatches(
  existing: TransactionRow,
  input: {
    fromType: 'player' | 'bank'
    fromPlayerId: string | null
    toType: 'player' | 'bank'
    toPlayerId: string | null
    amount: number
    category: TransactionCategory
  },
): void {
  const matches =
    existing.fromType === input.fromType &&
    existing.fromPlayerId === input.fromPlayerId &&
    existing.toType === input.toType &&
    existing.toPlayerId === input.toPlayerId &&
    existing.amount === input.amount &&
    existing.category === input.category

  if (!matches) {
    throw new AppError('DUPLICATE_REQUEST', '幂等键已被另一笔请求使用', 409)
  }
}

interface TransferInput {
  fromType: 'player' | 'bank'
  fromPlayerId: string | null
  toType: 'player' | 'bank'
  toPlayerId: string | null
  amount: number
  category: TransactionCategory
  note?: string
  clientRequestId: string
  operatorId: string
  allowedStatuses?: RoomStatus[]
  refundOf?: string
  reversalOf?: string
  allowBankruptSender?: boolean
}

function executeTransfer(auth: AuthContext, input: TransferInput): TransactionView {
  return db.transaction((tx) => {
    const room = tx.select().from(rooms).where(eq(rooms.id, auth.room.id)).get()
    if (!room) {
      throw new AppError('ROOM_NOT_FOUND', '房间不存在', 404)
    }
    const allowedStatuses = input.allowedStatuses ?? ['playing']
    if (!allowedStatuses.includes(room.status)) {
      throw new AppError('ROOM_STATE', '当前房间不能进行这笔交易', 409)
    }

    const existing = tx
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.roomId, room.id),
          eq(transactions.clientRequestId, input.clientRequestId),
        ),
      )
      .get()

    if (existing) {
      assertDuplicateMatches(existing, input)
      return toTransactionView(existing, playerNameMap(room.id))
    }

    if (input.refundOf || input.reversalOf) {
      const sourceId = input.refundOf ?? input.reversalOf
      const source = sourceId
        ? tx
            .select()
            .from(transactions)
            .where(and(eq(transactions.roomId, room.id), eq(transactions.id, sourceId)))
            .get()
        : null

      if (!source || source.status !== 'success') {
        throw new AppError('ALREADY_TERMINAL', '该交易已经退款或冲正', 409)
      }
    }

    if (input.fromType === input.toType && input.fromType === 'bank') {
      throw new AppError('INVALID_ARGUMENT', '银行不能给自己付款')
    }

    let fromPlayer: PlayerRow | null = null
    let toPlayer: PlayerRow | null = null
    let balanceAfterFrom: number | null = null
    let balanceAfterTo: number | null = null

    if (input.fromType === 'player') {
      if (!input.fromPlayerId) {
        throw new AppError('INVALID_ARGUMENT', '缺少付款玩家')
      }
      fromPlayer = getPlayerInRoom(tx, room.id, input.fromPlayerId)
      if (fromPlayer.status === 'bankrupt' && !input.allowBankruptSender) {
        throw new AppError('FORBIDDEN', '破产玩家不能主动付款', 403)
      }
      try {
        balanceAfterFrom = debit(fromPlayer.balance, input.amount)
      } catch (error) {
        if (error instanceof LedgerError) {
          throw new AppError(error.code, error.message, 409)
        }
        throw error
      }
    }

    if (input.toType === 'player') {
      if (!input.toPlayerId) {
        throw new AppError('INVALID_ARGUMENT', '缺少收款玩家')
      }
      toPlayer = getPlayerInRoom(tx, room.id, input.toPlayerId)
      if (fromPlayer && toPlayer.id === fromPlayer.id) {
        throw new AppError('INVALID_ARGUMENT', '不能给自己付款')
      }
      balanceAfterTo = credit(toPlayer.balance, input.amount)
    }

    const now = new Date()
    const seq = room.seq + 1

    if (fromPlayer && balanceAfterFrom !== null) {
      tx.update(players)
        .set({ balance: balanceAfterFrom })
        .where(eq(players.id, fromPlayer.id))
        .run()
    }

    if (toPlayer && balanceAfterTo !== null) {
      tx.update(players).set({ balance: balanceAfterTo }).where(eq(players.id, toPlayer.id)).run()
    }

    const transaction: typeof transactions.$inferInsert = {
      id: randomUUID(),
      roomId: room.id,
      seq,
      fromType: input.fromType,
      fromPlayerId: input.fromPlayerId,
      toType: input.toType,
      toPlayerId: input.toPlayerId,
      amount: input.amount,
      balanceAfterFrom,
      balanceAfterTo,
      refundOf: input.refundOf ?? null,
      reversalOf: input.reversalOf ?? null,
      category: input.category,
      note: input.note ?? null,
      status: 'success',
      operatorId: input.operatorId,
      clientRequestId: input.clientRequestId,
      createdAt: now,
    }

    tx.insert(transactions).values(transaction).run()

    if (input.refundOf) {
      tx.update(transactions)
        .set({ status: 'refunded' })
        .where(eq(transactions.id, input.refundOf))
        .run()
    }

    if (input.reversalOf) {
      tx.update(transactions)
        .set({ status: 'reversed' })
        .where(eq(transactions.id, input.reversalOf))
        .run()
    }

    tx.update(rooms)
      .set({
        seq,
        updatedAt: now,
        lastActivityAt: now,
      })
      .where(eq(rooms.id, room.id))
      .run()

    tx.insert(roomEvents)
      .values({
        id: randomUUID(),
        roomId: room.id,
        type: 'transaction',
        actorId: input.operatorId,
        payloadJson: {
          transactionId: transaction.id,
          amount: input.amount,
          category: input.category,
        },
        createdAt: now,
      })
      .run()

    const names = playerNameMap(room.id)
    return toTransactionView(transaction as TransactionRow, names)
  })
}

export function startGame(auth: AuthContext): { code: string; seq: number } {
  if (!auth.isHost) {
    throw new AppError('FORBIDDEN', '只有房主可以开始游戏', 403)
  }

  return db.transaction((tx) => {
    const room = tx.select().from(rooms).where(eq(rooms.id, auth.room.id)).get()
    if (!room) {
      throw new AppError('ROOM_NOT_FOUND', '房间不存在', 404)
    }
    if (room.status !== 'waiting') {
      throw new AppError('ROOM_STATE', '房间已经开始或结束', 409)
    }

    const seating = tx
      .select()
      .from(players)
      .where(and(eq(players.roomId, room.id), eq(players.isPlayer, true)))
      .all()

    if (seating.length < 2) {
      throw new AppError('ROOM_STATE', '至少需要 2 名玩家才能开始', 409)
    }

    const now = new Date()
    let seq = room.seq

    for (const player of seating) {
      const balanceAfter = credit(player.balance, room.configJson.initialFunds)
      seq += 1

      tx.update(players).set({ balance: balanceAfter }).where(eq(players.id, player.id)).run()

      tx.insert(transactions)
        .values({
          id: randomUUID(),
          roomId: room.id,
          seq,
          fromType: 'bank',
          fromPlayerId: null,
          toType: 'player',
          toPlayerId: player.id,
          amount: room.configJson.initialFunds,
          balanceAfterFrom: null,
          balanceAfterTo: balanceAfter,
          category: 'initial',
          note: '开局初始资金',
          status: 'success',
          operatorId: auth.player.id,
          clientRequestId: `initial-${player.id}`,
          createdAt: now,
        })
        .run()
    }

    tx.update(rooms)
      .set({
        status: 'playing',
        startedAt: now,
        updatedAt: now,
        lastActivityAt: now,
        seq,
      })
      .where(eq(rooms.id, room.id))
      .run()

    tx.insert(roomEvents)
      .values({
        id: randomUUID(),
        roomId: room.id,
        type: 'game_started',
        actorId: auth.player.id,
        payloadJson: { players: seating.length, seq },
        createdAt: now,
      })
      .run()

    return { code: room.code, seq }
  })
}

export function playerPay(auth: AuthContext, payload: PayRequest): TransactionView {
  const fromType = payload.fromType ?? 'player'

  if (fromType === 'bank') {
    if (!auth.isHost) {
      throw new AppError('FORBIDDEN', '只有房主可以使用银行付款', 403)
    }
  } else if (!auth.player.isPlayer) {
    throw new AppError('FORBIDDEN', '银行-only 房主没有个人余额', 403)
  }

  if (payload.toType === 'bank' && fromType === 'bank') {
    throw new AppError('INVALID_ARGUMENT', '银行不能给自己付款')
  }
  if (
    fromType === 'bank' &&
    auth.player.status === 'bankrupt' &&
    payload.toPlayerId === auth.player.id
  ) {
    throw new AppError('FORBIDDEN', '破产的双身份房主不能用银行给自己付款', 403)
  }

  assertCategory(payload.category, PLAYER_CATEGORIES)

  return executeTransfer(auth, {
    fromType,
    fromPlayerId: fromType === 'player' ? auth.player.id : null,
    toType: payload.toType,
    toPlayerId: payload.toType === 'player' ? (payload.toPlayerId ?? null) : null,
    amount: payload.amount,
    category: payload.category,
    note: payload.note,
    clientRequestId: payload.clientRequestId,
    operatorId: auth.player.id,
  })
}

export function bankPay(auth: AuthContext, payload: BankPayRequest): TransactionView {
  if (!auth.isHost) {
    throw new AppError('FORBIDDEN', '只有房主可以操作银行', 403)
  }
  if (auth.player.status === 'bankrupt' && payload.toPlayerId === auth.player.id) {
    throw new AppError('FORBIDDEN', '破产的双身份房主不能用银行给自己付款', 403)
  }
  assertCategory(payload.category, BANK_PAY_CATEGORIES)
  if (payload.category === 'correction' && !payload.note?.trim()) {
    throw new AppError('INVALID_ARGUMENT', '矫正必须填写原因')
  }

  return executeTransfer(auth, {
    fromType: 'bank',
    fromPlayerId: null,
    toType: 'player',
    toPlayerId: payload.toPlayerId,
    amount: payload.amount,
    category: payload.category,
    note: payload.note,
    clientRequestId: payload.clientRequestId,
    operatorId: auth.player.id,
    allowedStatuses: payload.category === 'correction' ? ['playing', 'settling'] : ['playing'],
  })
}

export function bankCollect(auth: AuthContext, payload: BankCollectRequest): TransactionView {
  if (!auth.isHost) {
    throw new AppError('FORBIDDEN', '只有房主可以操作银行', 403)
  }
  assertCategory(payload.category, BANK_COLLECT_CATEGORIES)
  if (payload.category === 'correction' && !payload.note?.trim()) {
    throw new AppError('INVALID_ARGUMENT', '矫正必须填写原因')
  }

  return executeTransfer(auth, {
    fromType: 'player',
    fromPlayerId: payload.fromPlayerId,
    toType: 'bank',
    toPlayerId: null,
    amount: payload.amount,
    category: payload.category,
    note: payload.note,
    clientRequestId: payload.clientRequestId,
    operatorId: auth.player.id,
    allowedStatuses: payload.category === 'correction' ? ['playing', 'settling'] : ['playing'],
    allowBankruptSender: true,
  })
}

export function salary(auth: AuthContext, payload: SalaryRequest): TransactionView {
  if (!auth.isHost) {
    throw new AppError('FORBIDDEN', '只有房主可以发工资', 403)
  }

  return executeTransfer(auth, {
    fromType: 'bank',
    fromPlayerId: null,
    toType: 'player',
    toPlayerId: payload.toPlayerId,
    amount: payload.amount ?? auth.room.configJson.salary,
    category: 'salary',
    note: '工资',
    clientRequestId: payload.clientRequestId,
    operatorId: auth.player.id,
  })
}

function findTransaction(roomId: string, transactionId: string): TransactionRow {
  const row = db
    .select()
    .from(transactions)
    .where(and(eq(transactions.roomId, roomId), eq(transactions.id, transactionId)))
    .get()

  if (!row) {
    throw new AppError('TRANSACTION_NOT_FOUND', '流水不存在', 404)
  }

  return row
}

export function refund(
  auth: AuthContext,
  transactionId: string,
  payload: RefundRequest,
): TransactionView {
  const original = findTransaction(auth.room.id, transactionId)

  if (original.status !== 'success') {
    throw new AppError('ALREADY_TERMINAL', '该交易已经退款或冲正', 409)
  }
  if (['initial', 'refund', 'reversal'].includes(original.category)) {
    throw new AppError('NOT_REFUNDABLE', '该交易不能退款', 409)
  }

  const isPayee = original.toType === 'bank' ? auth.isHost : original.toPlayerId === auth.player.id

  if (!isPayee) {
    throw new AppError('FORBIDDEN', '只有收款方可以发起退款', 403)
  }
  if (original.toType === 'player' && auth.player.status === 'bankrupt') {
    throw new AppError('FORBIDDEN', '破产玩家不能主动发起退款', 403)
  }

  return executeTransfer(auth, {
    fromType: original.toType,
    fromPlayerId: original.toPlayerId,
    toType: original.fromType,
    toPlayerId: original.fromPlayerId,
    amount: original.amount,
    category: 'refund',
    note: `退款：${original.note ?? '原交易'}`,
    clientRequestId: payload.clientRequestId,
    operatorId: auth.player.id,
    allowedStatuses: ['playing', 'settling'],
    refundOf: original.id,
  })
}

export function reverse(
  auth: AuthContext,
  transactionId: string,
  payload: ReverseRequest,
): TransactionView {
  if (!auth.isHost) {
    throw new AppError('FORBIDDEN', '只有房主可以冲正', 403)
  }

  const original = findTransaction(auth.room.id, transactionId)

  if (original.status !== 'success') {
    throw new AppError('ALREADY_TERMINAL', '该交易已经退款或冲正', 409)
  }
  if (['initial', 'refund', 'reversal'].includes(original.category)) {
    throw new AppError('NOT_REVERSIBLE', '该交易不能冲正', 409)
  }

  const reason = payload.reason.trim()
  if (!reason) {
    throw new AppError('INVALID_ARGUMENT', '冲正必须填写原因')
  }

  return executeTransfer(auth, {
    fromType: original.toType,
    fromPlayerId: original.toPlayerId,
    toType: original.fromType,
    toPlayerId: original.fromPlayerId,
    amount: original.amount,
    category: 'reversal',
    note: `冲正：${reason}`,
    clientRequestId: payload.clientRequestId,
    operatorId: auth.player.id,
    allowedStatuses: ['playing', 'settling'],
    reversalOf: original.id,
  })
}

export function setBankrupt(
  auth: AuthContext,
  payload: BankruptRequest,
): { playerId: string; bankrupt: boolean; seq: number } {
  if (!auth.isHost) {
    throw new AppError('FORBIDDEN', '只有房主可以标记破产', 403)
  }

  return db.transaction((tx) => {
    const room = tx.select().from(rooms).where(eq(rooms.id, auth.room.id)).get()
    if (!room || !['playing', 'settling'].includes(room.status)) {
      throw new AppError('ROOM_STATE', '当前房间不能标记破产', 409)
    }

    const player = getPlayerInRoom(tx, room.id, payload.playerId)
    const now = new Date()
    const seq = room.seq + 1

    tx.update(players)
      .set({
        status: payload.bankrupt ? 'bankrupt' : 'active',
        bankruptAt: payload.bankrupt ? now : null,
      })
      .where(eq(players.id, player.id))
      .run()

    tx.update(rooms)
      .set({ seq, updatedAt: now, lastActivityAt: now })
      .where(eq(rooms.id, room.id))
      .run()

    tx.insert(roomEvents)
      .values({
        id: randomUUID(),
        roomId: room.id,
        type: payload.bankrupt ? 'player_bankrupt' : 'player_bankrupt_cleared',
        actorId: auth.player.id,
        payloadJson: { playerId: player.id },
        createdAt: now,
      })
      .run()

    return { playerId: player.id, bankrupt: payload.bankrupt, seq }
  })
}

export function endGame(auth: AuthContext): { seq: number } {
  if (!auth.isHost) {
    throw new AppError('FORBIDDEN', '只有房主可以结束游戏', 403)
  }

  return db.transaction((tx) => {
    const room = tx.select().from(rooms).where(eq(rooms.id, auth.room.id)).get()
    if (!room || room.status !== 'playing') {
      throw new AppError('ROOM_STATE', '只有对局中的房间可以结束', 409)
    }

    const now = new Date()
    const seq = room.seq + 1
    tx.update(rooms)
      .set({
        status: 'settling',
        endedAt: now,
        updatedAt: now,
        lastActivityAt: now,
        seq,
      })
      .where(eq(rooms.id, room.id))
      .run()

    tx.insert(roomEvents)
      .values({
        id: randomUUID(),
        roomId: room.id,
        type: 'game_ended',
        actorId: auth.player.id,
        payloadJson: {},
        createdAt: now,
      })
      .run()

    return { seq }
  })
}

export function resumeGame(auth: AuthContext): { seq: number } {
  if (!auth.isHost) {
    throw new AppError('FORBIDDEN', '只有房主可以返回对局', 403)
  }

  return db.transaction((tx) => {
    const room = tx.select().from(rooms).where(eq(rooms.id, auth.room.id)).get()
    if (!room || room.status !== 'settling') {
      throw new AppError('ROOM_STATE', '只有结算中的房间可以返回对局', 409)
    }

    const now = new Date()
    const seq = room.seq + 1
    tx.update(rooms)
      .set({
        status: 'playing',
        endedAt: null,
        updatedAt: now,
        lastActivityAt: now,
        seq,
      })
      .where(eq(rooms.id, room.id))
      .run()

    tx.insert(roomEvents)
      .values({
        id: randomUUID(),
        roomId: room.id,
        type: 'game_resumed',
        actorId: auth.player.id,
        payloadJson: {},
        createdAt: now,
      })
      .run()

    return { seq }
  })
}

export function getAssets(roomId: string): AssetView[] {
  const playerRows = db
    .select()
    .from(players)
    .where(and(eq(players.roomId, roomId), eq(players.isPlayer, true)))
    .orderBy(players.joinedAt)
    .all()

  const assetRows = db.select().from(assetSnapshots).where(eq(assetSnapshots.roomId, roomId)).all()

  const byPlayer = new Map(assetRows.map((row) => [row.playerId, row]))

  return playerRows.map((player) => {
    const asset = byPlayer.get(player.id)
    const propertyValue = asset?.propertyValue ?? 0
    const debt = asset?.debt ?? 0
    return {
      playerId: player.id,
      nickname: player.nickname,
      avatar: player.avatar,
      cash: player.balance,
      propertyValue,
      debt,
      net: player.balance + propertyValue - debt,
      note: asset?.note ?? null,
      updatedBy: asset?.updatedBy ?? null,
      updatedAt: asset?.updatedAt.toISOString() ?? null,
      reason: asset?.reason ?? null,
    }
  })
}

export function updateAssets(auth: AuthContext, payload: AssetsRequest): void {
  db.transaction((tx) => {
    const room = tx.select().from(rooms).where(eq(rooms.id, auth.room.id)).get()
    if (!room || room.status !== 'settling') {
      throw new AppError('ROOM_STATE', '只有结算中的房间可以填写资产', 409)
    }

    const targetId = payload.playerId ?? auth.player.id
    if (!auth.isHost && targetId !== auth.player.id) {
      throw new AppError('FORBIDDEN', '只能填写自己的资产', 403)
    }
    if (auth.isHost && targetId !== auth.player.id && !payload.reason?.trim()) {
      throw new AppError('INVALID_ARGUMENT', '代填/修正资产必须填写原因')
    }

    const player = getPlayerInRoom(tx, room.id, targetId)
    const now = new Date()
    const seq = room.seq + 1

    tx.insert(assetSnapshots)
      .values({
        roomId: room.id,
        playerId: player.id,
        propertyValue: payload.propertyValue,
        debt: payload.debt,
        note: payload.note ?? null,
        updatedBy: auth.player.id,
        reason: payload.reason ?? null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [assetSnapshots.roomId, assetSnapshots.playerId],
        set: {
          propertyValue: payload.propertyValue,
          debt: payload.debt,
          note: payload.note ?? null,
          updatedBy: auth.player.id,
          reason: payload.reason ?? null,
          updatedAt: now,
        },
      })
      .run()

    tx.update(rooms)
      .set({ seq, updatedAt: now, lastActivityAt: now })
      .where(eq(rooms.id, room.id))
      .run()

    tx.insert(roomEvents)
      .values({
        id: randomUUID(),
        roomId: room.id,
        type: 'assets_updated',
        actorId: auth.player.id,
        payloadJson: { playerId: player.id },
        createdAt: now,
      })
      .run()
  })
}

export function getSettlement(roomId: string): SettlementView | null {
  const row = db.select().from(settlements).where(eq(settlements.roomId, roomId)).get()
  if (!row) return null
  return {
    rankings: row.rankingsJson,
    createdAt: row.createdAt.toISOString(),
  }
}

export function confirmSettlement(auth: AuthContext): RankingEntry[] {
  if (!auth.isHost) {
    throw new AppError('FORBIDDEN', '只有房主可以确认结算', 403)
  }

  return db.transaction((tx) => {
    const room = tx.select().from(rooms).where(eq(rooms.id, auth.room.id)).get()
    if (!room || room.status !== 'settling') {
      throw new AppError('ROOM_STATE', '只有结算中的房间可以确认结算', 409)
    }

    const playerRows = tx
      .select()
      .from(players)
      .where(and(eq(players.roomId, room.id), eq(players.isPlayer, true)))
      .orderBy(players.joinedAt)
      .all()

    const assetRows = tx
      .select()
      .from(assetSnapshots)
      .where(eq(assetSnapshots.roomId, room.id))
      .all()
    const byPlayer = new Map(assetRows.map((row) => [row.playerId, row]))

    const entries = playerRows
      .map((player) => {
        const asset = byPlayer.get(player.id)
        const propertyValue = asset?.propertyValue ?? 0
        const debt = asset?.debt ?? 0
        return {
          rank: 0,
          playerId: player.id,
          nickname: player.nickname,
          avatar: player.avatar,
          cash: player.balance,
          propertyValue,
          debt,
          net: player.balance + propertyValue - debt,
          bankrupt: player.status === 'bankrupt',
        }
      })
      .sort((left, right) => right.net - left.net)

    let lastNet: number | null = null
    let lastRank = 0
    entries.forEach((entry, index) => {
      if (entry.net !== lastNet) {
        lastNet = entry.net
        lastRank = index + 1
      }
      entry.rank = lastRank
    })

    const now = new Date()
    const seq = room.seq + 1

    tx.insert(settlements)
      .values({
        id: randomUUID(),
        roomId: room.id,
        rankingsJson: entries,
        createdAt: now,
      })
      .run()

    tx.update(rooms)
      .set({
        status: 'settled',
        settledAt: now,
        updatedAt: now,
        lastActivityAt: now,
        seq,
      })
      .where(eq(rooms.id, room.id))
      .run()

    tx.insert(roomEvents)
      .values({
        id: randomUUID(),
        roomId: room.id,
        type: 'settlement_confirmed',
        actorId: auth.player.id,
        payloadJson: { rankings: entries },
        createdAt: now,
      })
      .run()

    return entries
  })
}

export function getTransactionPage(
  auth: AuthContext,
  filter: TransactionFilter = 'all',
  beforeSeq?: number,
  limit = 50,
): TransactionPage {
  const conditions = [eq(transactions.roomId, auth.room.id)]

  if (filter === 'sent') {
    conditions.push(eq(transactions.fromPlayerId, auth.player.id))
  } else if (filter === 'received') {
    conditions.push(eq(transactions.toPlayerId, auth.player.id))
  } else if (filter === 'bank') {
    conditions.push(or(eq(transactions.fromType, 'bank'), eq(transactions.toType, 'bank'))!)
  }

  if (beforeSeq !== undefined) {
    conditions.push(lt(transactions.seq, beforeSeq))
  }

  const rows = db
    .select()
    .from(transactions)
    .where(and(...conditions))
    .orderBy(desc(transactions.seq))
    .limit(limit + 1)
    .all()

  const hasMore = rows.length > limit
  const pageRows = hasMore ? rows.slice(0, limit) : rows
  const names = playerNameMap(auth.room.id)
  const items = pageRows.map((row) => toTransactionView(row, names))

  return {
    items,
    hasMore,
    nextCursor: hasMore ? (items.at(-1)?.seq ?? null) : null,
  }
}
