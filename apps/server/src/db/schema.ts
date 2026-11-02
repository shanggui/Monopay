import type { RankingEntry, RoomConfig } from '@monopay/shared'
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const roomStatuses = ['waiting', 'playing', 'settling', 'settled', 'dissolved'] as const
export type RoomStatus = (typeof roomStatuses)[number]

export const hostIdentities = ['bank_only', 'dual'] as const
export type HostIdentity = (typeof hostIdentities)[number]

export const playerStatuses = ['active', 'bankrupt', 'left'] as const
export type PlayerStatus = (typeof playerStatuses)[number]

export const rooms = sqliteTable(
  'rooms',
  {
    id: text('id').primaryKey(),
    code: text('code').notNull(),
    status: text('status', { enum: roomStatuses }).notNull().default('waiting'),
    hostIdentity: text('host_identity', { enum: hostIdentities }).notNull(),
    hostPlayerId: text('host_player_id').notNull(),
    hostTokenHash: text('host_token_hash').notNull(),
    configJson: text('config_json', { mode: 'json' }).$type<RoomConfig>().notNull(),
    seq: integer('seq').notNull().default(0),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    lastActivityAt: integer('last_activity_at', { mode: 'timestamp_ms' }).notNull(),
    startedAt: integer('started_at', { mode: 'timestamp_ms' }),
    endedAt: integer('ended_at', { mode: 'timestamp_ms' }),
    settledAt: integer('settled_at', { mode: 'timestamp_ms' }),
    dissolvedAt: integer('dissolved_at', { mode: 'timestamp_ms' }),
  },
  (table) => [uniqueIndex('rooms_code_unique').on(table.code)],
)

export const players = sqliteTable(
  'players',
  {
    id: text('id').primaryKey(),
    roomId: text('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    nickname: text('nickname').notNull(),
    avatar: text('avatar'),
    isPlayer: integer('is_player', { mode: 'boolean' }).notNull().default(true),
    isBanker: integer('is_banker', { mode: 'boolean' }).notNull().default(false),
    balance: integer('balance').notNull().default(0),
    status: text('status', { enum: playerStatuses }).notNull().default('active'),
    joinedAt: integer('joined_at', { mode: 'timestamp_ms' }).notNull(),
    bankruptAt: integer('bankrupt_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    index('players_room_id_idx').on(table.roomId),
    uniqueIndex('players_token_hash_unique').on(table.tokenHash),
  ],
)

export const roomEvents = sqliteTable(
  'room_events',
  {
    id: text('id').primaryKey(),
    roomId: text('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    actorId: text('actor_id'),
    payloadJson: text('payload_json', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('room_events_room_id_created_at_idx').on(table.roomId, table.createdAt)],
)

export const transactionCategories = [
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
  'reversal',
  'correction',
  'other',
] as const
export type TransactionCategory = (typeof transactionCategories)[number]

export const transactionStatuses = ['success', 'refunded', 'reversed'] as const
export type TransactionStatus = (typeof transactionStatuses)[number]

export const transactionPartyTypes = ['player', 'bank'] as const
export type TransactionPartyType = (typeof transactionPartyTypes)[number]

export const transactions = sqliteTable(
  'transactions',
  {
    id: text('id').primaryKey(),
    roomId: text('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    fromType: text('from_type', { enum: transactionPartyTypes }).notNull(),
    fromPlayerId: text('from_player_id'),
    toType: text('to_type', { enum: transactionPartyTypes }).notNull(),
    toPlayerId: text('to_player_id'),
    amount: integer('amount').notNull(),
    balanceAfterFrom: integer('balance_after_from'),
    balanceAfterTo: integer('balance_after_to'),
    refundOf: text('refund_of'),
    reversalOf: text('reversal_of'),
    category: text('category', { enum: transactionCategories }).notNull(),
    note: text('note'),
    status: text('status', { enum: transactionStatuses }).notNull().default('success'),
    operatorId: text('operator_id').notNull(),
    clientRequestId: text('client_request_id').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    uniqueIndex('transactions_room_seq_unique').on(table.roomId, table.seq),
    uniqueIndex('transactions_room_request_unique').on(table.roomId, table.clientRequestId),
    index('transactions_room_created_idx').on(table.roomId, table.createdAt),
  ],
)

export const assetSnapshots = sqliteTable(
  'asset_snapshots',
  {
    roomId: text('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    playerId: text('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    propertyValue: integer('property_value').notNull().default(0),
    debt: integer('debt').notNull().default(0),
    note: text('note'),
    updatedBy: text('updated_by'),
    reason: text('reason'),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.roomId, table.playerId] })],
)

export const settlements = sqliteTable(
  'settlements',
  {
    id: text('id').primaryKey(),
    roomId: text('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    rankingsJson: text('rankings_json', { mode: 'json' }).$type<RankingEntry[]>().notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [uniqueIndex('settlements_room_unique').on(table.roomId)],
)

export const appMeta = sqliteTable('app_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})
