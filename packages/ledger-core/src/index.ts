/**
 * Pure ledger rules live here.
 * This package must not import Fastify, Vue, Drizzle, or Node-only modules.
 */
export const MONEY_MAX = 1_000_000_000

export type LedgerErrorCode = 'INVALID_AMOUNT' | 'INSUFFICIENT_BALANCE'

export class LedgerError extends Error {
  readonly code: LedgerErrorCode

  constructor(code: LedgerErrorCode, message: string) {
    super(message)
    this.name = 'LedgerError'
    this.code = code
  }
}

export function assertAmount(amount: number): void {
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > MONEY_MAX) {
    throw new LedgerError('INVALID_AMOUNT', '金额必须是 1 到 1,000,000,000 之间的整数')
  }
}

export function debit(balance: number, amount: number): number {
  assertAmount(amount)
  if (!Number.isSafeInteger(balance) || balance < amount) {
    throw new LedgerError('INSUFFICIENT_BALANCE', '余额不足，请先收款/抵押/变卖')
  }
  return balance - amount
}

export function credit(balance: number, amount: number): number {
  assertAmount(amount)
  if (!Number.isSafeInteger(balance) || balance < 0) {
    throw new LedgerError('INVALID_AMOUNT', '账户余额异常')
  }
  const next = balance + amount
  if (next > MONEY_MAX) {
    throw new LedgerError('INVALID_AMOUNT', '账户余额超出上限')
  }
  return next
}
