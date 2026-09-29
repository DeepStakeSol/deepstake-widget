export type JpoolErrorCode =
  | "JPOOL_MAINNET_ONLY"
  | "INVALID_REQUEST"
  | "INVALID_WALLET"
  | "INVALID_VOTE_ACCOUNT"
  | "INVALID_STAKE_LAMPORTS"
  | "JPOOL_POOL_UPDATING"
  | "JPOOL_DEPOSITS_RESTRICTED"
  | "JPOOL_DEPOSIT_TOO_SMALL"
  | "JPOOL_INSUFFICIENT_FUNDS"
  | "JPOOL_SIMULATION_FAILED"
  | "JPOOL_POOL_INVALID"
  | "JPOOL_RPC_UNAVAILABLE"
  | "JPOOL_GENERATE_FAILED"
  | "JPOOL_MANAGE_FAILED"
  | "JPOOL_ELIGIBILITY_FAILED";

export const JPOOL_ERROR_MESSAGES: Record<JpoolErrorCode, string> = {
  JPOOL_MAINNET_ONLY: "JPool is available on mainnet only",
  INVALID_REQUEST: "Request body is invalid",
  INVALID_WALLET: "Wallet address is invalid",
  INVALID_VOTE_ACCOUNT: "Validator vote account is invalid",
  INVALID_STAKE_LAMPORTS: "Stake amount is invalid",
  JPOOL_POOL_UPDATING:
    "JPool is updating for the new epoch. Please try again in a few minutes.",
  JPOOL_DEPOSITS_RESTRICTED:
    "Deposits to JPool are paused right now. Please try again later.",
  JPOOL_DEPOSIT_TOO_SMALL: "Stake amount is too small",
  JPOOL_INSUFFICIENT_FUNDS: "Insufficient SOL balance for this deposit",
  JPOOL_SIMULATION_FAILED: "JPool deposit simulation failed",
  JPOOL_POOL_INVALID: "JPool stake pool account is not valid",
  JPOOL_RPC_UNAVAILABLE: "Solana RPC is temporarily unavailable",
  JPOOL_GENERATE_FAILED: "Failed to generate JPool deposit transaction",
  JPOOL_MANAGE_FAILED: "Failed to load JPool data",
  JPOOL_ELIGIBILITY_FAILED: "Failed to check JPool eligibility"
};

export class JpoolRouteError extends Error {
  constructor(
    public readonly code: JpoolErrorCode,
    public readonly status: number,
    public readonly details?: unknown
  ) {
    super(JPOOL_ERROR_MESSAGES[code]);
    this.name = "JpoolRouteError";
  }
}

// TEMP(JPOOL-TMP-04): codes come from the SPL Stake Pool error enum, not from
// observed JPool failures; unknown failures fall back to a generic code.
const STAKE_POOL_CUSTOM_ERRORS: Record<number, JpoolErrorCode> = {
  7: "JPOOL_DEPOSITS_RESTRICTED", // SignatureMissing (deposit authority set)
  17: "JPOOL_POOL_UPDATING", // StakeListAndPoolOutOfDate
  29: "JPOOL_DEPOSIT_TOO_SMALL", // DepositTooSmall
  31: "JPOOL_DEPOSITS_RESTRICTED" // InvalidSolDepositAuthority
};

// Maps a simulation `err` value to a stable code. Only Custom errors raised by
// the DepositSol instruction are interpreted as Stake Pool errors.
export function normalizeDepositSimulationError(
  err: unknown,
  depositInstructionIndex: number
): JpoolErrorCode {
  if (err === "InsufficientFundsForFee" || err === "InsufficientFundsForRent") {
    return "JPOOL_INSUFFICIENT_FUNDS";
  }
  const instructionError = (err as { InstructionError?: unknown } | null)
    ?.InstructionError;
  if (!Array.isArray(instructionError) || instructionError.length !== 2) {
    return "JPOOL_SIMULATION_FAILED";
  }

  const [index, detail] = instructionError as [unknown, unknown];
  const custom = (detail as { Custom?: unknown } | null)?.Custom;
  // Custom 1 is ambiguous (a failed System transfer CPI and the Stake Pool
  // InvalidProgramAddress share it), so it stays generic.
  if (index === depositInstructionIndex && typeof custom === "number") {
    return STAKE_POOL_CUSTOM_ERRORS[custom] ?? "JPOOL_SIMULATION_FAILED";
  }
  return "JPOOL_SIMULATION_FAILED";
}
