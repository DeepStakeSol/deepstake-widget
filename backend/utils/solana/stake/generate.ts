import {
  appendTransactionMessageInstruction,
  createNoopSigner,
  createTransactionMessage,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  compileTransaction,
  assertIsTransactionMessageWithBlockhashLifetime,
  getBase64EncodedWireTransaction,
  prependTransactionMessageInstruction,
  getComputeUnitEstimateForTransactionMessageFactory,
  type Address,
  type Base64EncodedWireTransaction,
  type Rpc,
  type SolanaRpcApi,
  type TransactionSigner,
  type Blockhash
} from "@solana/kit";
import { getCreateAccountInstruction } from "@solana-program/system";
import {
  getDelegateStakeInstruction,
  getInitializeInstruction
} from "@solana-program/stake";
import {
  DEFAULT_PRIORITY_FEE_MICRO_LAMPORTS,
  INVALID_BUT_SUFFICIENT_FOR_COMPILATION_BLOCKHASH,
  MAX_COMPUTE_UNIT_LIMIT,
  STAKE_PROGRAM,
  SYSVAR,
  VOTE_PROGRAM_ADDRESS
} from "@/utils/constants";
import {
  getSetComputeUnitLimitInstruction,
  getSetComputeUnitPriceInstruction
} from "@solana-program/compute-budget";
import { getStakeMinimum } from "./minimum";

// A rejection the caller returns as-is: `body` is the JSON response, `status`
// its HTTP status.
export class StakeGenerateError extends Error {
  constructor(
    public readonly body: { error: string; details?: unknown },
    public readonly status: number
  ) {
    super(body.error);
    this.name = "StakeGenerateError";
  }
}

interface StakeMessageParams {
  authority: Address;
  authorityNoopSigner: TransactionSigner;
  newAccount: Address;
  newAccountNoopSigner: TransactionSigner;
  stakeLamports: number;
  blockhashObject: Readonly<{
    blockhash: Blockhash;
    lastValidBlockHeight: bigint;
  }>;
  computeUnitLimit: number;
  priorityFeeMicroLamports?: number;
  voteAccount: Address;
}

function toJsonSafe(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(toJsonSafe);

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(
      ([key, nestedValue]) => [key, toJsonSafe(nestedValue)]
    )
  );
}

export function getErrorDetails(error: unknown): unknown {
  if (!error || typeof error !== "object") return String(error);

  const err = error as {
    message?: string;
    cause?: unknown;
    context?: unknown;
    stack?: string;
  };

  return {
    message: err.message,
    context: toJsonSafe(err.context),
    cause: toJsonSafe(err.cause)
  };
}

async function validateStakeRequest({
  network,
  rpc,
  stakeLamports,
  voteAccount
}: {
  network: string | null;
  rpc: Rpc<SolanaRpcApi>;
  stakeLamports: number;
  voteAccount: Address;
}): Promise<void> {
  const [{ value: voteAccountInfo }, minimum] = await Promise.all([
    rpc
      .getAccountInfo(voteAccount, {
        commitment: "confirmed",
        encoding: "base64"
      })
      .send(),
    getStakeMinimum(network || "devnet", rpc)
  ]);

  if (!voteAccountInfo) {
    throw new StakeGenerateError(
      {
        error: "Vote account not found on selected network",
        details: {
          network: network || "devnet",
          voteAccount
        }
      },
      400
    );
  }

  if (voteAccountInfo.owner !== VOTE_PROGRAM_ADDRESS) {
    throw new StakeGenerateError(
      {
        error:
          "Configured vote account is not a Solana vote account on selected network",
        details: {
          network: network || "devnet",
          voteAccount,
          owner: voteAccountInfo.owner,
          expectedOwner: VOTE_PROGRAM_ADDRESS
        }
      },
      400
    );
  }

  if (stakeLamports < minimum.minimumStakeLamports) {
    throw new StakeGenerateError(
      {
        error: "Stake amount is below the selected network minimum",
        details: {
          stakeLamports,
          ...minimum
        }
      },
      400
    );
  }
}

function getStakeMessage({
  authority,
  authorityNoopSigner,
  newAccount,
  newAccountNoopSigner,
  stakeLamports,
  blockhashObject,
  computeUnitLimit,
  priorityFeeMicroLamports = DEFAULT_PRIORITY_FEE_MICRO_LAMPORTS,
  voteAccount
}: StakeMessageParams) {
  return pipe(
    createTransactionMessage({ version: 0 }),
    (msg) => setTransactionMessageFeePayer(authority, msg),
    (msg) => setTransactionMessageLifetimeUsingBlockhash(blockhashObject, msg),
    (msg) =>
      prependTransactionMessageInstruction(
        getSetComputeUnitLimitInstruction({ units: computeUnitLimit }),
        msg
      ),
    (msg) =>
      prependTransactionMessageInstruction(
        getSetComputeUnitPriceInstruction({
          microLamports: priorityFeeMicroLamports
        }),
        msg
      ),
    (msg) =>
      appendTransactionMessageInstruction(
        getCreateAccountInstruction({
          payer: authorityNoopSigner,
          newAccount: newAccountNoopSigner,
          lamports: BigInt(stakeLamports),
          space: STAKE_PROGRAM.STAKE_ACCOUNT_SPACE,
          programAddress: STAKE_PROGRAM.ADDRESS
        }),
        msg
      ),
    (msg) =>
      appendTransactionMessageInstruction(
        getInitializeInstruction(
          {
            stake: newAccount,
            rentSysvar: SYSVAR.RENT_ADDRESS,
            arg0: {
              staker: authority,
              withdrawer: authority
            },
            arg1: STAKE_PROGRAM.DEFAULT_LOCKUP
          },
          { programAddress: STAKE_PROGRAM.ADDRESS }
        ),
        msg
      ),
    (msg) =>
      appendTransactionMessageInstruction(
        getDelegateStakeInstruction(
          {
            stake: newAccount,
            //vote: getValidatorAddress(),
            vote: voteAccount,
            clockSysvar: SYSVAR.CLOCK_ADDRESS,
            stakeHistory: SYSVAR.STAKE_HISTORY_ADDRESS,
            unused: STAKE_PROGRAM.CONFIG_ADDRESS,
            stakeAuthority: authorityNoopSigner
          },
          { programAddress: STAKE_PROGRAM.ADDRESS }
        ),
        msg
      )
  );
}

// Builds the unsigned native stake transaction (create account, initialize,
// delegate) used by /api/stake/generate and /api/selftest. Throws
// StakeGenerateError for a bad vote account, an amount below the minimum or a
// failed compute-unit simulation; RPC failures propagate unchanged.
export async function buildNativeStakeTransaction({
  network,
  rpc,
  stakeLamports,
  authority,
  newAccount,
  voteAccount
}: {
  network: string | null;
  rpc: Rpc<SolanaRpcApi>;
  stakeLamports: number;
  authority: Address;
  newAccount: Address;
  voteAccount: Address;
}): Promise<Base64EncodedWireTransaction> {
  await validateStakeRequest({ network, rpc, stakeLamports, voteAccount });

  const authorityNoopSigner = createNoopSigner(authority);
  const newAccountNoopSigner = createNoopSigner(newAccount);

  const sampleMessage = getStakeMessage({
    authority,
    authorityNoopSigner,
    newAccount,
    newAccountNoopSigner,
    stakeLamports,
    blockhashObject: INVALID_BUT_SUFFICIENT_FOR_COMPILATION_BLOCKHASH,
    computeUnitLimit: MAX_COMPUTE_UNIT_LIMIT,
    voteAccount
  });

  assertIsTransactionMessageWithBlockhashLifetime(sampleMessage);
  let computeUnitEstimate: number;
  try {
    computeUnitEstimate =
      await getComputeUnitEstimateForTransactionMessageFactory({ rpc })(
        sampleMessage
      );
  } catch (error) {
    console.error("Stake compute estimate error:", error);
    throw new StakeGenerateError(
      {
        error: "Stake transaction simulation failed",
        details: getErrorDetails(error)
      },
      400
    );
  }

  const { value: latestBlockhash } = await rpc
    .getLatestBlockhash({ commitment: "confirmed" })
    .send();
  const message = getStakeMessage({
    authority,
    authorityNoopSigner,
    newAccount,
    newAccountNoopSigner,
    stakeLamports,
    blockhashObject: latestBlockhash,
    computeUnitLimit: computeUnitEstimate,
    voteAccount
  });

  assertIsTransactionMessageWithBlockhashLifetime(message);

  return getBase64EncodedWireTransaction(compileTransaction(message));
}
