import Database from 'better-sqlite3'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { env } from '../env'
import { appMeta } from './schema'

if (env.DB_PATH !== ':memory:') {
  mkdirSync(dirname(env.DB_PATH), { recursive: true })
}

export const sqlite = new Database(env.DB_PATH)

sqlite.pragma('journal_mode = WAL')
sqlite.pragma('synchronous = NORMAL')
sqlite.pragma('foreign_keys = ON')
sqlite.pragma('busy_timeout = 5000')

export const db = drizzle(sqlite, { schema: { appMeta } })

export function runMigrations(): void {
  const candidates = [
    resolve(import.meta.dirname, '../drizzle'),
    resolve(import.meta.dirname, '../../drizzle'),
    resolve(process.cwd(), 'drizzle'),
    resolve(process.cwd(), 'apps/server/drizzle'),
  ]
  const migrationsFolder = candidates.find((candidate) => existsSync(candidate))

  if (!migrationsFolder) {
    throw new Error(`Migration folder not found. Tried: ${candidates.join(', ')}`)
  }

  migrate(db, { migrationsFolder })
}

export function initializeMeta(): string {
  const existing = db.select().from(appMeta).where(eq(appMeta.key, 'initialized_at')).get()

  if (existing) {
    return existing.value
  }

  const value = new Date().toISOString()
  db.insert(appMeta)
    .values({
      key: 'initialized_at',
      value,
      updatedAt: new Date(),
    })
    .run()

  return value
}

export function checkDatabase(): void {
  sqlite.prepare('select 1 as ok').get()
}

export function closeDatabase(): void {
  if (sqlite.open) {
    sqlite.close()
  }
}
