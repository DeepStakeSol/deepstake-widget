import { NextResponse } from "next/server";
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
import {
  getUnstakeInstruction,
} from "@/utils/solana/stake/unstake-instructions";
import { createRpcConnection } from "@/utils/solana/rpc";
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

interface UnstakeMessageParams {
  authority: Address;
  authorityNoopSigner: TransactionSigner;
  newAccount: Address;
  blockhashObject: Readonly<{
    blockhash: Blockhash;
    lastValidBlockHeight: bigint;
  }>;
  computeUnitLimit: number;
  priorityFeeMicroLamports?: number;
}

function getUnstakeMessage({
  authority,
  authorityNoopSigner,
  newAccount,
  blockhashObject,
  computeUnitLimit,
  priorityFeeMicroLamports = DEFAULT_PRIORITY_FEE_MICRO_LAMPORTS,
}: UnstakeMessageParams) {
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
        getUnstakeInstruction(
          {
            stake: newAccount,
            clockSysvar: SYSVAR.CLOCK_ADDRESS,
            stakeAuthority: authorityNoopSigner
          },
          { programAddress: STAKE_PROGRAM.ADDRESS }
        ),
        msg
      )
  );
}

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const network = searchParams.get("network") || "devnet";

  const { stakerAddress, stakeAccountAddress} =
      await request.json();

    
    if (!stakerAddress) {
      return NextResponse.json(
        { error: "Missing required parameter: stakerAddress" },
        { status: 400 }
      );
    }

    if (!stakeAccountAddress) {
      return NextResponse.json(
        { error: "Missing required parameter: stakeAccountAddress" },
        { status: 400 }
      );
    }

    const authority = address(stakerAddress);
    const newAccount = address(stakeAccountAddress);
    assertIsAddress(authority);
    assertIsAddress(newAccount);

    const rpc = createRpcConnection(network);

    const authorityNoopSigner = createNoopSigner(authority);

    const sampleMessage = getUnstakeMessage({
      authority,
      authorityNoopSigner,
      newAccount,
      blockhashObject: INVALID_BUT_SUFFICIENT_FOR_COMPILATION_BLOCKHASH,
      computeUnitLimit: MAX_COMPUTE_UNIT_LIMIT,
    });

    assertIsTransactionMessageWithBlockhashLifetime(sampleMessage);

    const computeUnitEstimate =
      await getComputeUnitEstimateForTransactionMessageFactory({ rpc })(
        sampleMessage
      );

    const { value: latestBlockhash } = await rpc
      .getLatestBlockhash({ commitment: "confirmed" })
      .send();
    const message = getUnstakeMessage({
      authority,
      authorityNoopSigner,
      newAccount,
      blockhashObject: latestBlockhash,
      computeUnitLimit: computeUnitEstimate,
    });

    console.log("[unstake]sampleMessage: ", sampleMessage);

    assertIsTransactionMessageWithBlockhashLifetime(message);

    const compiledTransaction = compileTransaction(message);

    console.log("[unstake]compiledTransaction: ", compiledTransaction);

    const wireTransaction =
      getBase64EncodedWireTransaction(compiledTransaction);

    console.log("[unstake]wireTransaction: ", wireTransaction);

    const resp = 
      NextResponse.json({
        wireTransaction
    });

    console.log("[unstake]resp: ", resp);

    return resp;
}
