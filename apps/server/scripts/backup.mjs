import Database from 'better-sqlite3'
import { mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { resolve } from 'node:path'

const dbPath = resolve(process.env.DB_PATH ?? './data/monopay.db')
const backupDir = resolve(process.env.BACKUP_DIR ?? './backups')
const keepDays = Number(process.env.BACKUP_KEEP_DAYS ?? 7)

mkdirSync(backupDir, { recursive: true })

const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const target = resolve(backupDir, `monopay-${stamp}.db`)
const db = new Database(dbPath, { readonly: true })

try {
  await db.backup(target)
} finally {
  db.close()
}

for (const file of readdirSync(backupDir)) {
  if (!file.startsWith('monopay-') || !file.endsWith('.db')) continue
  const path = resolve(backupDir, file)
  const ageDays = (Date.now() - statSync(path).mtimeMs) / 86_400_000
  if (ageDays > keepDays) {
    unlinkSync(path)
    console.log(`pruned ${path}`)
  }
}

console.log(
  JSON.stringify({
    ok: true,
    source: dbPath,
    target,
    keepDays,
  }),
)
