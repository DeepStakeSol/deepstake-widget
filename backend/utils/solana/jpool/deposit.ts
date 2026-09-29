import type { StakePoolFee } from "@/utils/solana/blaze/stake-pool";

const U64_MAX = (BigInt(1) << BigInt(64)) - BigInt(1);
const DECIMAL_LAMPORTS = /^[1-9][0-9]*$/;

// TEMP(JPOOL-TMP-05): referral codes are not added until JPool confirms the
// exact `ref:<code>&direct:<vote>` bytes (J3).
export function buildJpoolDirectStakeMemo(voteAccount: string): string {
  return `direct:${voteAccount}`;
}

// Deposit amounts travel as decimal strings so they never pass through
// floating point; anything else is rejected rather than coerced.
export function parseStakeLamports(value: unknown): bigint | null {
  if (typeof value !== "string" || !DECIMAL_LAMPORTS.test(value)) return null;
  const lamports = BigInt(value);
  return lamports <= U64_MAX ? lamports : null;
}

export interface DepositSolQuoteInput {
  lamports: bigint;
  totalLamports: bigint;
  poolTokenSupply: bigint;
  solDepositFee: StakePoolFee;
}

// Mirrors SPL Stake Pool `DepositSol`: floor the pool-token conversion, then
// subtract the SOL deposit fee rounded up. Returns null when the program would
// reject the deposit or the pool state cannot produce a meaningful quote.
export function quoteDepositSol({
  lamports,
  totalLamports,
  poolTokenSupply,
  solDepositFee
}: DepositSolQuoteInput): bigint | null {
  const zero = BigInt(0);
  if (lamports <= zero) return null;
  if ((totalLamports === zero) !== (poolTokenSupply === zero)) return null;

  const grossPoolTokens =
    totalLamports === zero
      ? lamports
      : (lamports * poolTokenSupply) / totalLamports;

  const { denominator, numerator } = solDepositFee;
  if (denominator !== zero && numerator > denominator) return null;
  const fee =
    denominator === zero
      ? zero
      : (grossPoolTokens * numerator + denominator - BigInt(1)) / denominator;

  const userPoolTokens = grossPoolTokens - fee;
  return userPoolTokens > zero ? userPoolTokens : null;
}
