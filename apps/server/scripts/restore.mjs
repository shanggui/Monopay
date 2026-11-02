import { copyFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const source = process.argv[2]
const target = resolve(process.argv[3] ?? process.env.DB_PATH ?? './data/monopay.db')
const force = process.argv.includes('--force')

if (!source) {
  console.error('Usage: node scripts/restore.mjs <backup.db> [target.db] [--force]')
  process.exit(1)
}

if (!existsSync(source)) {
  console.error(`Backup not found: ${source}`)
  process.exit(1)
}

if (existsSync(target) && !force) {
  console.error(`Target exists: ${target}. Re-run with --force to overwrite.`)
  process.exit(1)
}

mkdirSync(dirname(target), { recursive: true })
copyFileSync(source, target)

// Remove stale WAL/SHM so the restored file is the source of truth.
for (const suffix of ['-wal', '-shm']) {
  const sidecar = `${target}${suffix}`
  if (existsSync(sidecar)) unlinkSync(sidecar)
}

console.log(JSON.stringify({ ok: true, source, target }))
