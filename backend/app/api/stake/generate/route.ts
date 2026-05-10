import { NextResponse } from "next/server";
import { Connection, PublicKey, VoteProgram } from "@solana/web3.js";
import {
  address,
  appendTransactionMessageInstruction,
  assertIsAddress,
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
  type TransactionSigner,
  type Blockhash
} from "@solana/kit";
import { getCreateAccountInstruction } from "@solana-program/system";
import {
  getInitializeInstruction,
  getDelegateStakeInstruction
} from "@/utils/solana/stake/stake-instructions";
import { createRpcConnection, getRpcEndpoint } from "@/utils/solana/rpc";
import {
  DEFAULT_PRIORITY_FEE_MICRO_LAMPORTS,
  INVALID_BUT_SUFFICIENT_FOR_COMPILATION_BLOCKHASH,
  MAX_COMPUTE_UNIT_LIMIT,
  STAKE_PROGRAM,
  SYSVAR
} from "@/utils/constants";
import {
  getSetComputeUnitLimitInstruction,
  getSetComputeUnitPriceInstruction
} from "@solana-program/compute-budget";

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
    Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
      key,
      toJsonSafe(nestedValue)
    ])
  );
}

function getErrorDetails(error: unknown): unknown {
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
    cause: toJsonSafe(err.cause),
  };
}

async function validateStakeRequest({
  network,
  stakeLamports,
  voteAccount
}: {
  network: string | null;
  stakeLamports: number;
  voteAccount: string;
}) {
  const endpoint = getRpcEndpoint(network);
  const connection = new Connection(endpoint, "confirmed");
  const votePublicKey = new PublicKey(voteAccount);
  const voteAccountInfo = await connection.getAccountInfo(votePublicKey, "confirmed");

  if (!voteAccountInfo) {
    return NextResponse.json(
      {
        error: "Vote account not found on selected network",
        details: {
          network: network || "devnet",
          voteAccount
        }
      },
      { status: 400 }
    );
  }

  if (!voteAccountInfo.owner.equals(VoteProgram.programId)) {
    return NextResponse.json(
      {
        error: "Configured vote account is not a Solana vote account on selected network",
        details: {
          network: network || "devnet",
          voteAccount,
          owner: voteAccountInfo.owner.toBase58(),
          expectedOwner: VoteProgram.programId.toBase58()
        }
      },
      { status: 400 }
    );
  }

  const rentExemptReserve = await connection.getMinimumBalanceForRentExemption(
    Number(STAKE_PROGRAM.STAKE_ACCOUNT_SPACE)
  );
  const minimumDelegation = (
    await connection.getStakeMinimumDelegation({ commitment: "confirmed" })
  ).value;
  const minimumStakeLamports = rentExemptReserve + minimumDelegation;

  if (stakeLamports < minimumStakeLamports) {
    return NextResponse.json(
      {
        error: "Stake amount is below the selected network minimum",
        details: {
          network: network || "devnet",
          stakeLamports,
          rentExemptReserve,
          minimumDelegation,
          minimumStakeLamports,
          minimumStakeSol: minimumStakeLamports / 1_000_000_000
        }
      },
      { status: 400 }
    );
  }

  return null;
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
            authorized: {
              staker: authority,
              withdrawer: authority
            },
            lockup: STAKE_PROGRAM.DEFAULT_LOCKUP
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

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const network = searchParams.get("network");

    const { stakeLamports, stakerAddress, newAccountAddress, voteAccount } =
      await request.json();

    if (!stakeLamports) {
      return NextResponse.json(
        { error: "Missing required parameter: stakeLamports" },
        { status: 400 }
      );
    }
    if (!stakerAddress) {
      return NextResponse.json(
        { error: "Missing required parameter: stakerAddress" },
        { status: 400 }
      );
    }
    if (!newAccountAddress) {
      return NextResponse.json(
        { error: "Missing required parameter: newAccountAddress" },
        { status: 400 }
      );
    }
    if (!voteAccount) {
      return NextResponse.json(
        { error: "Missing required parameter: voteAccount" },
        { status: 400 }
      );
    }

    console.log("voteAcc", voteAccount);

    const authority = address(stakerAddress);
    const newAccount = address(newAccountAddress);
    const voteAccountAddress = address(voteAccount);
    assertIsAddress(authority);
    assertIsAddress(newAccount);
    assertIsAddress(voteAccountAddress);

    const rpc = createRpcConnection(network);

    const validationError = await validateStakeRequest({
      network,
      stakeLamports,
      voteAccount
    });
    if (validationError) return validationError;

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
      voteAccount: voteAccountAddress
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
      return NextResponse.json(
        {
          error: "Stake transaction simulation failed",
          details: getErrorDetails(error)
        },
        { status: 400 }
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
      voteAccount: voteAccountAddress
    });

    assertIsTransactionMessageWithBlockhashLifetime(message);

    const compiledTransaction = compileTransaction(message);
    const wireTransaction =
      getBase64EncodedWireTransaction(compiledTransaction);

    return NextResponse.json({
      wireTransaction
    });
  } catch (error) {
    console.error("Stake transaction generation error:", error);
    return NextResponse.json(
      {
        error: "Failed to generate stake transaction",
        details: getErrorDetails(error)
      },
      { status: 500 }
    );
  }
}
