// Exact SOL <-> lamports conversion for amounts that go on the wire. SOL and
// JSOL both have 9 decimals; nothing here passes through floating point
// except `solNumberToLamports`, which only reads display balances.
export const LAMPORT_DECIMALS = 9
const LAMPORTS_PER_SOL_BIGINT = BigInt(1_000_000_000)
const SOL_AMOUNT = /^(\d*)(?:\.(\d*))?$/

// "1.5" -> 1_500_000_000n. Null for empty, malformed or over-precise input
// (more than 9 decimals is rejected, not rounded).
export function parseSolToLamports(value: string): bigint | null {
  const match = SOL_AMOUNT.exec(value.trim())
  if (!match) return null
  const [, whole = '', fraction = ''] = match
  if (!whole && !fraction) return null
  if (fraction.length > LAMPORT_DECIMALS) return null
  return (
    BigInt(whole || '0') * LAMPORTS_PER_SOL_BIGINT +
    BigInt(fraction.padEnd(LAMPORT_DECIMALS, '0') || '0')
  )
}

// 1_500_000_000n -> "1.5". `maxDecimals` truncates (never rounds up), so a
// displayed amount is never more than the real one.
export function formatLamports(lamports: bigint, maxDecimals = LAMPORT_DECIMALS): string {
  const negative = lamports < BigInt(0)
  const abs = negative ? -lamports : lamports
  const whole = abs / LAMPORTS_PER_SOL_BIGINT
  const fraction = (abs % LAMPORTS_PER_SOL_BIGINT)
    .toString()
    .padStart(LAMPORT_DECIMALS, '0')
    .slice(0, Math.max(0, Math.min(maxDecimals, LAMPORT_DECIMALS)))
    .replace(/0+$/, '')
  return (negative ? '-' : '') + whole.toString() + (fraction ? '.' + fraction : '')
}

// `/balance` returns SOL as a JSON number; this recovers the lamports it was
// computed from (exact for balances below ~9M SOL).
export function solNumberToLamports(sol: number): bigint {
  if (!Number.isFinite(sol) || sol <= 0) return BigInt(0)
  return BigInt(Math.round(sol * 1_000_000_000))
}

// 6_000_000_000n, 5 -> "6.00000". Truncates like `formatLamports` but keeps
// exactly `decimals` digits, for aligned display amounts.
export function formatLamportsFixed(lamports: bigint, decimals: number): string {
  const digits = Math.max(0, Math.min(decimals, LAMPORT_DECIMALS))
  const negative = lamports < BigInt(0)
  const abs = negative ? -lamports : lamports
  const whole = (abs / LAMPORTS_PER_SOL_BIGINT).toString()
  const fraction = (abs % LAMPORTS_PER_SOL_BIGINT)
    .toString()
    .padStart(LAMPORT_DECIMALS, '0')
    .slice(0, digits)
  return (negative ? '-' : '') + whole + (digits > 0 ? '.' + fraction : '')
}
