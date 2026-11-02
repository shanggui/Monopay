import {
  createRoomRequestSchema,
  joinRoomRequestSchema,
  roomConfigSchema,
  type CreateRoomRequest,
  type CreateRoomResponse,
  type JoinRoomRequest,
  type JoinRoomResponse,
  type PlayerView,
  type RoomConfig,
  type RoomSnapshot,
  type RoomView,
} from '@monopay/shared'
import { and, eq, lt, notInArray } from 'drizzle-orm'
import { randomUUID, timingSafeEqual } from 'node:crypto'
import { db } from '../db'
import {
  players,
  roomEvents,
  rooms,
  type HostIdentity,
  type RoomStatus,
  type PlayerStatus,
} from '../db/schema'
import { env } from '../env'
import { AppError } from '../lib/errors'
import { createRoomCode, createToken, hashToken } from '../lib/tokens'
import { getAssets, getBankSummary, getRecentTransactions, getSettlement } from './ledger'

type RoomRow = typeof rooms.$inferSelect
type PlayerRow = typeof players.$inferSelect

export interface AuthContext {
  room: RoomRow
  player: PlayerRow
  isHost: boolean
}

function normalizeCode(code: string): string {
  const normalized = code.trim()
  if (!/^\d{6}$/.test(normalized)) {
    throw new AppError('INVALID_ARGUMENT', '房号应为 6 位数字')
  }
  return normalized
}

function safeHashEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'hex')
  const rightBuffer = Buffer.from(right, 'hex')
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function isUniqueConstraint(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    String((error as { code: unknown }).code).startsWith('SQLITE_CONSTRAINT')
  )
}

function roomUrl(code: string): string {
  return `${env.PUBLIC_URL.replace(/\/$/, '')}/r/${code}`
}

function toPlayerView(player: PlayerRow, hostPlayerId: string): PlayerView {
  return {
    id: player.id,
    nickname: player.nickname,
    avatar: player.avatar,
    isHost: player.id === hostPlayerId,
    isPlayer: player.isPlayer,
    isBanker: player.isBanker,
    balance: player.balance,
    status: player.status as PlayerStatus,
  }
}

function toRoomView(room: RoomRow): RoomView {
  return {
    code: room.code,
    status: room.status as RoomStatus,
    hostIdentity: room.hostIdentity as HostIdentity,
    config: room.configJson,
    seq: room.seq,
    createdAt: room.createdAt.toISOString(),
    startedAt: room.startedAt?.toISOString() ?? null,
    endedAt: room.endedAt?.toISOString() ?? null,
    settledAt: room.settledAt?.toISOString() ?? null,
    dissolvedAt: room.dissolvedAt?.toISOString() ?? null,
  }
}

export function authenticateRoom(code: string, rawToken?: string): AuthContext {
  if (!rawToken) {
    throw new AppError('UNAUTHORIZED', '缺少房间凭证', 401)
  }

  const normalizedCode = normalizeCode(code)
  const room = db.select().from(rooms).where(eq(rooms.code, normalizedCode)).get()

  if (!room) {
    throw new AppError('ROOM_NOT_FOUND', '房间不存在', 404)
  }

  const tokenHash = hashToken(rawToken)
  const isHost = safeHashEqual(room.hostTokenHash, tokenHash)
  const player = isHost
    ? db.select().from(players).where(eq(players.id, room.hostPlayerId)).get()
    : db
        .select()
        .from(players)
        .where(and(eq(players.roomId, room.id), eq(players.tokenHash, tokenHash)))
        .get()

  if (!player) {
    throw new AppError('UNAUTHORIZED', '房间凭证无效', 401)
  }

  return { room, player, isHost }
}

export function createRoom(payload: unknown): CreateRoomResponse {
  const input: CreateRoomRequest = createRoomRequestSchema.parse(payload)
  const config: RoomConfig = roomConfigSchema.parse({
    initialFunds: input.initialFunds,
    maxPlayers: input.maxPlayers,
    salary: input.salary,
    largeConfirmAmount: input.largeConfirmAmount,
    soundEnabled: input.soundEnabled,
  })

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = createRoomCode()
    const roomId = randomUUID()
    const hostPlayerId = randomUUID()
    const hostToken = createToken()
    const now = new Date()
    const isPlayer = input.hostIdentity === 'dual'

    try {
      db.transaction((tx) => {
        tx.insert(rooms)
          .values({
            id: roomId,
            code,
            status: 'waiting',
            hostIdentity: input.hostIdentity,
            hostPlayerId,
            hostTokenHash: hashToken(hostToken),
            configJson: config,
            seq: 0,
            createdAt: now,
            updatedAt: now,
            lastActivityAt: now,
          })
          .run()

        tx.insert(players)
          .values({
            id: hostPlayerId,
            roomId,
            tokenHash: hashToken(hostToken),
            nickname: input.hostNickname,
            avatar: null,
            isPlayer,
            isBanker: true,
            balance: 0,
            status: 'active',
            joinedAt: now,
          })
          .run()

        tx.insert(roomEvents)
          .values({
            id: randomUUID(),
            roomId,
            type: 'room_created',
            actorId: hostPlayerId,
            payloadJson: {
              hostIdentity: input.hostIdentity,
              hostNickname: input.hostNickname,
            },
            createdAt: now,
          })
          .run()
      })

      return {
        roomCode: code,
        hostToken,
        playerId: hostPlayerId,
        url: roomUrl(code),
      }
    } catch (error) {
      if (isUniqueConstraint(error)) {
        continue
      }
      throw error
    }
  }

  throw new AppError('INTERNAL', '房号生成失败，请重试', 500)
}

export function joinRoom(code: string, payload: unknown, rawToken?: string): JoinRoomResponse {
  const input: JoinRoomRequest = joinRoomRequestSchema.parse(payload)
  const normalizedCode = normalizeCode(code)
  const now = new Date()

  return db.transaction((tx) => {
    const room = tx.select().from(rooms).where(eq(rooms.code, normalizedCode)).get()

    if (!room) {
      throw new AppError('ROOM_NOT_FOUND', '房间不存在', 404)
    }

    if (rawToken) {
      const tokenHash = hashToken(rawToken)
      const existing = tx
        .select()
        .from(players)
        .where(and(eq(players.roomId, room.id), eq(players.tokenHash, tokenHash)))
        .get()

      if (!existing) {
        throw new AppError('UNAUTHORIZED', '房间凭证无效', 401)
      }

      if (!existing.isPlayer) {
        throw new AppError('FORBIDDEN', '银行身份不能作为玩家重新加入', 403)
      }

      tx.update(players)
        .set({
          nickname: input.nickname,
          avatar: input.avatar ?? existing.avatar,
        })
        .where(eq(players.id, existing.id))
        .run()

      const nextSeq = room.seq + 1
      tx.update(rooms)
        .set({
          seq: nextSeq,
          updatedAt: now,
          lastActivityAt: now,
        })
        .where(eq(rooms.id, room.id))
        .run()

      return {
        playerId: existing.id,
        reconnected: true,
      }
    }

    if (room.status !== 'waiting') {
      throw new AppError('ROOM_STATE', '对局已开始，无法加入', 409)
    }

    const playerCount = tx
      .select()
      .from(players)
      .where(and(eq(players.roomId, room.id), eq(players.isPlayer, true)))
      .all().length

    if (playerCount >= room.configJson.maxPlayers) {
      throw new AppError('ROOM_FULL', '房间人数已满', 409)
    }

    const playerId = randomUUID()
    const playerToken = createToken()
    const nextSeq = room.seq + 1

    tx.insert(players)
      .values({
        id: playerId,
        roomId: room.id,
        tokenHash: hashToken(playerToken),
        nickname: input.nickname,
        avatar: input.avatar ?? null,
        isPlayer: true,
        isBanker: false,
        balance: 0,
        status: 'active',
        joinedAt: now,
      })
      .run()

    tx.update(rooms)
      .set({
        seq: nextSeq,
        updatedAt: now,
        lastActivityAt: now,
      })
      .where(eq(rooms.id, room.id))
      .run()

    tx.insert(roomEvents)
      .values({
        id: randomUUID(),
        roomId: room.id,
        type: 'player_joined',
        actorId: playerId,
        payloadJson: { nickname: input.nickname },
        createdAt: now,
      })
      .run()

    return {
      playerId,
      playerToken,
      reconnected: false,
    }
  })
}

export function getSnapshot(auth: AuthContext): RoomSnapshot {
  const { room, player } = auth
  const playerRows = db
    .select()
    .from(players)
    .where(and(eq(players.roomId, room.id), eq(players.isPlayer, true)))
    .orderBy(players.joinedAt)
    .all()

  const hostRow = db.select().from(players).where(eq(players.id, room.hostPlayerId)).get() ?? player

  return {
    room: toRoomView(room),
    host: toPlayerView(hostRow, room.hostPlayerId),
    me: toPlayerView(player, room.hostPlayerId),
    players: playerRows.map((row) => toPlayerView(row, room.hostPlayerId)),
    transactions: getRecentTransactions(room.id),
    bankSummary: getBankSummary(room.id),
    assets: getAssets(room.id),
    settlement: getSettlement(room.id),
    lastSeq: room.seq,
  }
}

export function dissolveRoom(code: string, rawToken?: string): { code: string; seq: number } {
  const auth = authenticateRoom(code, rawToken)

  if (!auth.isHost) {
    throw new AppError('FORBIDDEN', '只有房主可以解散房间', 403)
  }

  if (auth.room.status === 'settled' || auth.room.status === 'dissolved') {
    throw new AppError('ROOM_STATE', '房间已经结束', 409)
  }

  const now = new Date()
  const nextSeq = auth.room.seq + 1

  db.transaction((tx) => {
    tx.update(rooms)
      .set({
        status: 'dissolved',
        dissolvedAt: now,
        updatedAt: now,
        lastActivityAt: now,
        seq: nextSeq,
      })
      .where(eq(rooms.id, auth.room.id))
      .run()

    tx.insert(roomEvents)
      .values({
        id: randomUUID(),
        roomId: auth.room.id,
        type: 'room_dissolved',
        actorId: auth.player.id,
        payloadJson: {},
        createdAt: now,
      })
      .run()
  })

  return { code: auth.room.code, seq: nextSeq }
}

export function expireStaleRooms(): number {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1_000)
  const staleRooms = db
    .select()
    .from(rooms)
    .where(
      and(lt(rooms.lastActivityAt, cutoff), notInArray(rooms.status, ['settled', 'dissolved'])),
    )
    .all()

  if (staleRooms.length === 0) {
    return 0
  }

  const now = new Date()

  db.transaction((tx) => {
    for (const room of staleRooms) {
      tx.update(rooms)
        .set({
          status: 'dissolved',
          dissolvedAt: now,
          updatedAt: now,
          seq: room.seq + 1,
        })
        .where(eq(rooms.id, room.id))
        .run()
    }
  })

  return staleRooms.length
}
