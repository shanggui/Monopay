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

export const transactionCategorySchema = z.enum([
  'initial',
  'rent',
  'purchase',
  'tax',
  'fine',
  'chance',
  'mortgage',
  'loan',
  'repay',
  'trade',
  'salary',
  'refund',
  'correction',
  'other',
])

export type TransactionCategory = z.infer<typeof transactionCategorySchema>

export const transactionStatusSchema = z.enum(['success', 'refunded', 'reversed'])
export type TransactionStatus = z.infer<typeof transactionStatusSchema>

export const payRequestSchema = z
  .object({
    toType: z.enum(['player', 'bank']),
    toPlayerId: z.string().min(1).optional(),
    amount: moneySchema,
    category: transactionCategorySchema,
    note: z.string().trim().max(50).optional(),
    clientRequestId: z.string().trim().min(8).max(80),
    fromType: z.enum(['player', 'bank']).optional(),
  })
  .superRefine((value, context) => {
    if (value.toType === 'player' && !value.toPlayerId) {
      context.addIssue({
        code: 'custom',
        path: ['toPlayerId'],
        message: '选择收款玩家',
      })
    }
  })

export type PayRequest = z.infer<typeof payRequestSchema>

export const bankPayRequestSchema = z.object({
  toPlayerId: z.string().min(1),
  amount: moneySchema,
  category: transactionCategorySchema,
  note: z.string().trim().max(50).optional(),
  clientRequestId: z.string().trim().min(8).max(80),
})

export type BankPayRequest = z.infer<typeof bankPayRequestSchema>

export const bankCollectRequestSchema = z.object({
  fromPlayerId: z.string().min(1),
  amount: moneySchema,
  category: transactionCategorySchema,
  note: z.string().trim().max(50).optional(),
  clientRequestId: z.string().trim().min(8).max(80),
})

export type BankCollectRequest = z.infer<typeof bankCollectRequestSchema>

export const salaryRequestSchema = z.object({
  toPlayerId: z.string().min(1),
  amount: moneySchema.optional(),
  nickname: z.string().trim().max(20).optional(),
  clientRequestId: z.string().trim().min(8).max(80),
})

export type SalaryRequest = z.infer<typeof salaryRequestSchema>

export interface TransactionView {
  id: string
  seq: number
  fromType: 'player' | 'bank'
  fromPlayerId: string | null
  fromName: string
  toType: 'player' | 'bank'
  toPlayerId: string | null
  toName: string
  amount: number
  balanceAfterFrom: number | null
  balanceAfterTo: number | null
  category: TransactionCategory
  note: string | null
  status: TransactionStatus
  createdAt: string
}

export interface BankSummary {
  issued: number
  collected: number
  net: number
}

export interface PaymentResult {
  transaction: TransactionView
  snapshot: RoomSnapshot
}

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
  transactions: TransactionView[]
  bankSummary: BankSummary
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
  | { type: 'transaction'; data: { transaction: TransactionView } }
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
