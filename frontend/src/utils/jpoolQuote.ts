// Copy of backend/utils/solana/jpool/deposit.ts `quoteDepositSol`. Keep both
// in sync; jpoolQuote.test.ts repeats the backend test vectors.
export interface StakePoolFee {
  denominator: bigint
  numerator: bigint
}

export interface DepositSolQuoteInput {
  lamports: bigint
  totalLamports: bigint
  poolTokenSupply: bigint
  solDepositFee: StakePoolFee
}

// Mirrors SPL Stake Pool `DepositSol`: floor the pool-token conversion, then
// subtract the SOL deposit fee rounded up. Returns null when the program would
// reject the deposit or the pool state cannot produce a meaningful quote.
export function quoteDepositSol({
  lamports,
  totalLamports,
  poolTokenSupply,
  solDepositFee,
}: DepositSolQuoteInput): bigint | null {
  const zero = BigInt(0)
  if (lamports <= zero) return null
  if ((totalLamports === zero) !== (poolTokenSupply === zero)) return null

  const grossPoolTokens =
    totalLamports === zero ? lamports : (lamports * poolTokenSupply) / totalLamports

  const { denominator, numerator } = solDepositFee
  if (denominator !== zero && numerator > denominator) return null
  const fee =
    denominator === zero
      ? zero
      : (grossPoolTokens * numerator + denominator - BigInt(1)) / denominator

  const userPoolTokens = grossPoolTokens - fee
  return userPoolTokens > zero ? userPoolTokens : null
}
