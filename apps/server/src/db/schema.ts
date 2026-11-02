import type { RoomConfig } from '@monopay/shared'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

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

export const appMeta = sqliteTable('app_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})
