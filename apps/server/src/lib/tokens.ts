import { createHash, randomBytes, randomInt } from 'node:crypto'

export function createToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function createRoomCode(): string {
  return randomInt(100_000, 1_000_000).toString()
}
