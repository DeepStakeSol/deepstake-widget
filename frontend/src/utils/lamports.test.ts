import { describe, expect, it } from 'vitest'

import { formatLamports, parseSolToLamports, solNumberToLamports } from './lamports'

describe('parseSolToLamports', () => {
  it.each([
    ['1', BigInt(1_000_000_000)],
    ['0', BigInt(0)],
    ['0.5', BigInt(500_000_000)],
    ['.5', BigInt(500_000_000)],
    ['1.', BigInt(1_000_000_000)],
    ['0.000000001', BigInt(1)],
    ['0.01', BigInt(10_000_000)],
    // 0.1 + 0.2 style float traps stay exact
    ['0.3', BigInt(300_000_000)],
    ['123456789.123456789', BigInt('123456789123456789')],
    ['18446744073.709551615', BigInt('18446744073709551615')],
    [' 2 ', BigInt(2_000_000_000)],
  ])('parses %j', (input, expected) => {
    expect(parseSolToLamports(input)).toBe(expected)
  })

  it.each(['', '.', '0.0000000001', '1e9', '-1', '1,5', 'abc', '1.2.3', '+1'])(
    'rejects %j',
    (input) => {
      expect(parseSolToLamports(input)).toBeNull()
    }
  )
})

describe('formatLamports', () => {
  it.each([
    [BigInt(0), '0'],
    [BigInt(1), '0.000000001'],
    [BigInt(1_500_000_000), '1.5'],
    [BigInt(7_264_213), '0.007264213'],
    [BigInt('18446744073709551615'), '18446744073.709551615'],
    [BigInt(-1_500_000_000), '-1.5'],
  ])('formats %s', (lamports, expected) => {
    expect(formatLamports(lamports)).toBe(expected)
  })

  it('truncates instead of rounding when limiting decimals', () => {
    expect(formatLamports(BigInt(7_264_999), 4)).toBe('0.0072')
    expect(formatLamports(BigInt(1_999_999_999), 2)).toBe('1.99')
    expect(formatLamports(BigInt(1_000_000_001), 4)).toBe('1')
    expect(formatLamports(BigInt(1_500_000_000), 0)).toBe('1')
  })

  it('round-trips with parseSolToLamports', () => {
    for (const lamports of [BigInt(1), BigInt(10_000_000), BigInt('987654321012345678')]) {
      expect(parseSolToLamports(formatLamports(lamports))).toBe(lamports)
    }
  })
})

describe('solNumberToLamports', () => {
  it('recovers the lamports behind a /balance number', () => {
    expect(solNumberToLamports(0.3)).toBe(BigInt(300_000_000))
    expect(solNumberToLamports(1.123456789)).toBe(BigInt(1_123_456_789))
    expect(solNumberToLamports(12345.000000001)).toBe(BigInt('12345000000001'))
  })

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('maps %s to zero', (value) => {
    expect(solNumberToLamports(value)).toBe(BigInt(0))
  })
})
