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
  getWithdrawInstruction,
} from "@/utils/solana/stake/withdraw-instructions-v2";
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
import { getBalance } from "@/utils/solana/balance";

interface WithdrawMessageParams {
  stakeAccount: Address;
  recipientAccount: Address;
  recipientNoopSigner: TransactionSigner;

  withdrawLamports: number;

  blockhashObject: Readonly<{
    blockhash: Blockhash;
    lastValidBlockHeight: bigint;
  }>;
  computeUnitLimit: number;
  priorityFeeMicroLamports?: number;
}

function getWithdrawMessage({
  stakeAccount,
  recipientAccount,
  recipientNoopSigner,
  withdrawLamports,

  blockhashObject,
  computeUnitLimit,
  priorityFeeMicroLamports = DEFAULT_PRIORITY_FEE_MICRO_LAMPORTS,
}: WithdrawMessageParams) {
  return pipe(
    createTransactionMessage({ version: 0 }),
    (msg) => setTransactionMessageFeePayer(recipientAccount, msg),
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


      //
      (msg) =>
      appendTransactionMessageInstruction(
        getWithdrawInstruction(
          {
            stake: stakeAccount,
            recipient: recipientAccount,
            clockSysvar: SYSVAR.CLOCK_ADDRESS,
            stakeHistory: SYSVAR.STAKE_HISTORY_ADDRESS,
            withdrawAuthority: recipientNoopSigner,
            lockupAuthority: STAKE_PROGRAM.DEFAULT_LOCKUP,
            args: withdrawLamports,
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

  const { stakeAccountAddress, recipientAccountAddress } =
      await request.json();

    
    if (!stakeAccountAddress) {
      return NextResponse.json(
        { error: "Missing required parameter: stakeAccountAddress" },
        { status: 400 }
      );
    }

    if (!recipientAccountAddress) {
      return NextResponse.json(
        { error: "Missing required parameter: recipientAccountAddress" },
        { status: 400 }
      );
    }

    const stakeAccount = address(stakeAccountAddress);
    const recipientAccount = address(recipientAccountAddress);

    assertIsAddress(stakeAccount);
    assertIsAddress(recipientAccount);

    const rpc = createRpcConnection(network);

    const withdrawLamports = await getBalance({
          rpc,
          address: stakeAccount
        });

    const recipientNoopSigner = createNoopSigner(recipientAccount);

    const sampleMessage = getWithdrawMessage({
      stakeAccount,
      recipientAccount,
      recipientNoopSigner,
      withdrawLamports,
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
    const message = getWithdrawMessage({
      stakeAccount,
      recipientAccount,
      recipientNoopSigner,
      withdrawLamports,
      blockhashObject: latestBlockhash,
      computeUnitLimit: computeUnitEstimate,
    });

    assertIsTransactionMessageWithBlockhashLifetime(message);

    const compiledTransaction = compileTransaction(message);

    const wireTransaction =
      getBase64EncodedWireTransaction(compiledTransaction);

    const resp = 
      NextResponse.json({
        wireTransaction
    });

    return resp;
}
