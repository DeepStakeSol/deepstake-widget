import { describe, expect, it } from 'vitest'

import { quoteDepositSol } from './jpoolQuote'

// Same vectors as backend/utils/solana/jpool/deposit.test.ts: the two copies
// of quoteDepositSol must agree.
const NO_FEE = { denominator: BigInt(0), numerator: BigInt(0) }

describe('quoteDepositSol (backend parity vectors)', () => {
  it('floors the pool-token conversion', () => {
    expect(
      quoteDepositSol({
        lamports: BigInt(10_000_000),
        totalLamports: BigInt(1_376_600_000),
        poolTokenSupply: BigInt(1_000_000_000),
        solDepositFee: NO_FEE,
      })
    ).toBe(BigInt(7_264_274))
  })

  it('applies the SOL deposit fee rounded up', () => {
    expect(
      quoteDepositSol({
        lamports: BigInt(1_001),
        totalLamports: BigInt(1),
        poolTokenSupply: BigInt(1),
        solDepositFee: { denominator: BigInt(10_000), numerator: BigInt(8) },
      })
    ).toBe(BigInt(1_000))
  })

  it('treats a zero denominator or numerator as no fee', () => {
    const input = { lamports: BigInt(500), totalLamports: BigInt(2), poolTokenSupply: BigInt(1) }
    expect(quoteDepositSol({ ...input, solDepositFee: NO_FEE })).toBe(BigInt(250))
    expect(
      quoteDepositSol({
        ...input,
        solDepositFee: { denominator: BigInt(100), numerator: BigInt(0) },
      })
    ).toBe(BigInt(250))
  })

  it('uses a 1:1 rate for an empty pool', () => {
    expect(
      quoteDepositSol({
        lamports: BigInt(42),
        totalLamports: BigInt(0),
        poolTokenSupply: BigInt(0),
        solDepositFee: NO_FEE,
      })
    ).toBe(BigInt(42))
  })

  it('keeps u64-scale arithmetic exact', () => {
    const max = BigInt('18446744073709551615')
    expect(
      quoteDepositSol({
        lamports: max,
        totalLamports: max,
        poolTokenSupply: max - BigInt(1),
        solDepositFee: NO_FEE,
      })
    ).toBe(max - BigInt(1))
  })

  it('returns null when the program would reject the deposit', () => {
    const base = { totalLamports: BigInt(1_000), poolTokenSupply: BigInt(1), solDepositFee: NO_FEE }
    expect(quoteDepositSol({ ...base, lamports: BigInt(999) })).toBeNull()
    expect(
      quoteDepositSol({
        lamports: BigInt(1),
        totalLamports: BigInt(1),
        poolTokenSupply: BigInt(1),
        solDepositFee: { denominator: BigInt(100), numerator: BigInt(1) },
      })
    ).toBeNull()
  })

  it('returns null for inconsistent pool state or fee', () => {
    expect(
      quoteDepositSol({
        lamports: BigInt(10),
        totalLamports: BigInt(0),
        poolTokenSupply: BigInt(5),
        solDepositFee: NO_FEE,
      })
    ).toBeNull()
    expect(
      quoteDepositSol({
        lamports: BigInt(10),
        totalLamports: BigInt(1),
        poolTokenSupply: BigInt(1),
        solDepositFee: { denominator: BigInt(1), numerator: BigInt(2) },
      })
    ).toBeNull()
  })
})
