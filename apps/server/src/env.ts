import { config } from 'dotenv'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'

// Support running from apps/server, the repo root, or a bundled dist directory.
const envFiles = [
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), '../../.env'),
  resolve(import.meta.dirname, '../../../.env'),
  resolve(import.meta.dirname, '../../.env'),
]

for (const path of new Set(envFiles)) {
  if (existsSync(path)) {
    config({ path, quiet: true })
    break
  }
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DB_PATH: z.string().default('./data/dev.db'),
  PUBLIC_URL: z.string().url().default('http://localhost:5173'),
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  WEB_DIST: z.string().optional(),
  APP_VERSION: z.string().default('0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('Invalid environment:', parsed.error.flatten().fieldErrors)
  process.exit(1)
}

const dbPath =
  parsed.data.DB_PATH === ':memory:' ? ':memory:' : resolve(process.cwd(), parsed.data.DB_PATH)

const webDist = parsed.data.WEB_DIST
  ? resolve(process.cwd(), parsed.data.WEB_DIST)
  : resolve(import.meta.dirname, '../../web/dist')

export const env = {
  ...parsed.data,
  DB_PATH: dbPath,
  WEB_DIST: webDist,
}
