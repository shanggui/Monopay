import { z } from 'zod'

export const serviceName = 'Monopay 桌游账房'

export const healthDataSchema = z.object({
  service: z.string(),
  version: z.string(),
})

export type HealthData = z.infer<typeof healthDataSchema>

export const readyDataSchema = z.object({
  database: z.literal('ok'),
  initializedAt: z.string(),
})

export type ReadyData = z.infer<typeof readyDataSchema>

export const hostIdentitySchema = z.enum(['bank_only', 'dual'])
export type HostIdentity = z.infer<typeof hostIdentitySchema>

export const roomStatusSchema = z.enum(['waiting', 'playing', 'settling', 'settled', 'dissolved'])
export type RoomStatus = z.infer<typeof roomStatusSchema>

export const playerStatusSchema = z.enum(['active', 'bankrupt', 'left'])
export type PlayerStatus = z.infer<typeof playerStatusSchema>

export const moneySchema = z.number().int().min(1).max(1_000_000_000)

export const roomConfigSchema = z.object({
  initialFunds: moneySchema,
  maxPlayers: z.number().int().min(2).max(6),
  salary: moneySchema,
  largeConfirmAmount: z.number().int().min(0).max(1_000_000_000),
  soundEnabled: z.boolean(),
})

export type RoomConfig = z.infer<typeof roomConfigSchema>

export const createRoomRequestSchema = z.object({
  hostIdentity: hostIdentitySchema.default('dual'),
  initialFunds: moneySchema.default(2_000),
  maxPlayers: z.number().int().min(2).max(6).default(6),
  salary: moneySchema.default(200),
  largeConfirmAmount: z.number().int().min(0).max(1_000_000_000).default(1_000),
  soundEnabled: z.boolean().default(true),
  hostNickname: z.string().trim().min(1).max(20).default('房主'),
})

export type CreateRoomRequest = z.infer<typeof createRoomRequestSchema>

export const joinRoomRequestSchema = z.object({
  nickname: z.string().trim().min(1).max(20),
  avatar: z.string().trim().max(8).optional(),
})

export type JoinRoomRequest = z.infer<typeof joinRoomRequestSchema>

export interface PlayerView {
  id: string
  nickname: string
  avatar: string | null
  isHost: boolean
  isPlayer: boolean
  isBanker: boolean
  balance: number
  status: PlayerStatus
}

export interface RoomView {
  code: string
  status: RoomStatus
  hostIdentity: HostIdentity
  config: RoomConfig
  seq: number
  createdAt: string
  startedAt: string | null
  endedAt: string | null
  settledAt: string | null
  dissolvedAt: string | null
}

export interface RoomSnapshot {
  room: RoomView
  host: PlayerView
  me: PlayerView
  players: PlayerView[]
  lastSeq: number
}

export interface CreateRoomResponse {
  roomCode: string
  hostToken: string
  playerId: string
  url: string
}

export interface JoinRoomResponse {
  playerId: string
  playerToken?: string
  reconnected: boolean
}

export type WsClientMessage = { type: 'auth'; roomCode: string; token: string } | { type: 'ping' }

export type WsServerEvent =
  | { type: 'ready'; data: { roomCode: string; playerId: string; isHost: boolean } }
  | { type: 'player_joined'; data: { player: PlayerView } }
  | { type: 'room_updated'; data: { status: RoomStatus; seq: number } }
  | { type: 'pong' }
  | { type: 'error'; data: { code: string; message: string } }

export interface ApiSuccess<T> {
  ok: true
  data: T
  serverTime: number
}

export interface ApiFailure {
  ok: false
  error: {
    code: string
    message: string
    details?: unknown
  }
  serverTime: number
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure
