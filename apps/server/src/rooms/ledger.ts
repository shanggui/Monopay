import { credit, debit, LedgerError } from '@monopay/ledger-core'
import type {
  BankCollectRequest,
  BankPayRequest,
  BankSummary,
  PayRequest,
  SalaryRequest,
  TransactionCategory,
  TransactionView,
} from '@monopay/shared'
import { and, desc, eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { db } from '../db'
import { players, roomEvents, rooms, transactions, type TransactionStatus } from '../db/schema'
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
    })
    .from(transactions)
    .where(and(eq(transactions.roomId, roomId), eq(transactions.status, 'success')))
    .all()

  let issued = 0
  let collected = 0

  for (const row of rows) {
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
}

function executeTransfer(auth: AuthContext, input: TransferInput): TransactionView {
  return db.transaction((tx) => {
    const room = tx.select().from(rooms).where(eq(rooms.id, auth.room.id)).get()
    if (!room) {
      throw new AppError('ROOM_NOT_FOUND', '房间不存在', 404)
    }
    if (room.status !== 'playing') {
      throw new AppError('ROOM_STATE', '当前房间不在对局中', 409)
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
      category: input.category,
      note: input.note ?? null,
      status: 'success',
      operatorId: input.operatorId,
      clientRequestId: input.clientRequestId,
      createdAt: now,
    }

    tx.insert(transactions).values(transaction).run()

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
  assertCategory(payload.category, BANK_PAY_CATEGORIES)

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
  })
}

export function bankCollect(auth: AuthContext, payload: BankCollectRequest): TransactionView {
  if (!auth.isHost) {
    throw new AppError('FORBIDDEN', '只有房主可以操作银行', 403)
  }
  assertCategory(payload.category, BANK_COLLECT_CATEGORIES)

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
