import { describe, expect, it } from 'vitest'
import { LedgerError, MONEY_MAX, assertAmount, credit, debit } from './index'

describe('ledger money helpers', () => {
  it('accepts only positive integer amounts within the limit', () => {
    expect(() => assertAmount(1)).not.toThrow()
    expect(() => assertAmount(MONEY_MAX)).not.toThrow()

    for (const amount of [0, -1, 1.5, MONEY_MAX + 1, Number.NaN]) {
      expect(() => assertAmount(amount)).toThrow(LedgerError)
    }
  })

  it('debits only when the balance is sufficient', () => {
    expect(debit(2_000, 200)).toBe(1_800)
    expect(() => debit(100, 101)).toThrow(LedgerError)
  })

  it('credits without allowing a negative starting balance', () => {
    expect(credit(0, 2_000)).toBe(2_000)
    expect(credit(1_000, 200)).toBe(1_200)
    expect(() => credit(-1, 200)).toThrow(LedgerError)
  })
})
