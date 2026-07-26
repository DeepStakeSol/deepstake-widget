import { type NextRequest, NextResponse } from "next/server";
import {
  address,
  appendTransactionMessageInstructions,
  assertIsAddress,
  assertIsTransactionMessageWithBlockhashLifetime,
  compileTransaction,
  createNoopSigner,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  getBase64Encoder,
  getComputeUnitEstimateForTransactionMessageFactory,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
  type Blockhash,
  type IInstruction
} from "@solana/kit";
import {
  findAssociatedTokenPda,
  TOKEN_PROGRAM_ADDRESS
} from "@solana-program/token";
import {
  getSetComputeUnitLimitInstruction,
  getSetComputeUnitPriceInstruction
} from "@solana-program/compute-budget";

import { getPriorityFeeEstimate } from "@/utils/priorityFee";
import { createRpcConnection, getRpcEndpoint } from "@/utils/solana/rpc";
import {
  decodeBlazeStakePoolAccount,
  findStakePoolWithdrawAuthority,
  getBlazeMemoInstruction,
  getCreateAssociatedTokenAccountInstruction,
  getDepositSolInstruction,
  STAKE_POOL_PROGRAM_ADDRESS
} from "@/utils/solana/blaze/stake-pool";
import {
  BSOL_MINT,
  getBlazeStakePoolAddress,
  getBlazeUpdatePoolUrl
} from "@/utils/consts";

interface BlazeMessageParams {
  wallet: Address;
  blockhashObject: Readonly<{
    blockhash: Blockhash;
    lastValidBlockHeight: bigint;
  }>;
  instructions: readonly IInstruction[];
  computeUnitLimit?: number;
  priorityFeeMicroLamports?: number;
}

function getBlazeMessage({
  wallet,
  blockhashObject,
  instructions,
  computeUnitLimit,
  priorityFeeMicroLamports
}: BlazeMessageParams) {
  const message = pipe(
    createTransactionMessage({ version: "legacy" }),
    (msg) => setTransactionMessageFeePayer(wallet, msg),
    (msg) => setTransactionMessageLifetimeUsingBlockhash(blockhashObject, msg)
  );

  const allInstructions: IInstruction[] = [];
  if (computeUnitLimit !== undefined) {
    allInstructions.push(
      getSetComputeUnitLimitInstruction({ units: computeUnitLimit })
    );
  }
  if (priorityFeeMicroLamports !== undefined) {
    allInstructions.push(
      getSetComputeUnitPriceInstruction({
        microLamports: priorityFeeMicroLamports
      })
    );
  }
  allInstructions.push(...instructions);
  return appendTransactionMessageInstructions(allInstructions, message);
}

export async function POST(request: NextRequest) {
  const network = request.nextUrl.searchParams.get("network") || "mainnet";

  try {
    const { wallet, stakeLamports, voteIdentity } = await request.json();

    if (!wallet || !stakeLamports) {
      return NextResponse.json(
        { error: "wallet and stakeLamports are required" },
        { status: 400 }
      );
    }

    const rpcUrl = getRpcEndpoint(network);
    if (!rpcUrl) {
      return NextResponse.json(
        { error: "RPC endpoint not configured" },
        { status: 500 }
      );
    }

    const walletAddress = address(wallet);
    const stakePoolAddress = address(getBlazeStakePoolAddress(network));
    const bsolMint = address(BSOL_MINT);
    assertIsAddress(walletAddress);
    assertIsAddress(stakePoolAddress);
    assertIsAddress(bsolMint);

    const rpc = createRpcConnection(network);
    const walletSigner = createNoopSigner(walletAddress);
    const [bsolAta] = await findAssociatedTokenPda({
      owner: walletAddress,
      mint: bsolMint,
      tokenProgram: TOKEN_PROGRAM_ADDRESS
    });

    const [
      { value: stakePoolAccountInfo },
      epochInfo,
      { value: ataAccountInfo },
      { value: latestBlockhash }
    ] = await Promise.all([
      rpc
        .getAccountInfo(stakePoolAddress, {
          commitment: "confirmed",
          encoding: "base64"
        })
        .send(),
      rpc.getEpochInfo({ commitment: "confirmed" }).send(),
      rpc
        .getAccountInfo(bsolAta, {
          commitment: "confirmed",
          encoding: "base64"
        })
        .send(),
      rpc.getLatestBlockhash({ commitment: "finalized" }).send()
    ]);

    if (!stakePoolAccountInfo) {
      throw new Error("Invalid stake pool account");
    }
    if (stakePoolAccountInfo.owner !== STAKE_POOL_PROGRAM_ADDRESS) {
      throw new Error("Invalid stake pool account owner");
    }

    const stakePool = decodeBlazeStakePoolAccount(
      new Uint8Array(getBase64Encoder().encode(stakePoolAccountInfo.data[0]))
    );
    if (stakePool.tokenProgram !== TOKEN_PROGRAM_ADDRESS) {
      throw new Error("Unsupported stake pool token program");
    }
    if (stakePool.lastUpdateEpoch !== epochInfo.epoch) {
      try {
        await fetch(getBlazeUpdatePoolUrl(network));
      } catch {
        // Proceed even if the best-effort update call fails.
      }
    }

    const withdrawAuthority =
      await findStakePoolWithdrawAuthority(stakePoolAddress);
    const instructions: IInstruction[] = [];
    if (!ataAccountInfo) {
      instructions.push(
        getCreateAssociatedTokenAccountInstruction({
          payer: walletSigner,
          ata: bsolAta,
          owner: walletAddress,
          mint: bsolMint
        })
      );
    }
    instructions.push(
      getDepositSolInstruction({
        stakePool: stakePoolAddress,
        withdrawAuthority,
        reserveStake: stakePool.reserveStake,
        fundingAccount: walletSigner,
        destinationPoolAccount: bsolAta,
        managerFeeAccount: stakePool.managerFeeAccount,
        referralPoolAccount: bsolAta,
        poolMint: stakePool.poolMint,
        lamports: BigInt(stakeLamports)
      })
    );
    if (voteIdentity) {
      instructions.push(
        getBlazeMemoInstruction({
          wallet: walletSigner,
          validator: voteIdentity
        })
      );
    }

    const sampleMessage = getBlazeMessage({
      wallet: walletAddress,
      blockhashObject: latestBlockhash,
      instructions
    });
    assertIsTransactionMessageWithBlockhashLifetime(sampleMessage);

    const sampleTransaction = compileTransaction(sampleMessage);
    const sampleWireTransaction =
      getBase64EncodedWireTransaction(sampleTransaction);
    const priorityTransaction = {
      serialize: () => getBase64Encoder().encode(sampleWireTransaction)
    };
    const [{ priorityFeeEstimate: microLamports }, estimatedComputeUnits] =
      await Promise.all([
        getPriorityFeeEstimate("Medium", priorityTransaction, rpcUrl),
        getComputeUnitEstimateForTransactionMessageFactory({ rpc })(
          sampleMessage
        )
      ]);

    const message = getBlazeMessage({
      wallet: walletAddress,
      blockhashObject: latestBlockhash,
      instructions,
      computeUnitLimit: estimatedComputeUnits + 3_000,
      priorityFeeMicroLamports: microLamports
    });
    assertIsTransactionMessageWithBlockhashLifetime(message);

    return NextResponse.json({
      transaction: getBase64EncodedWireTransaction(compileTransaction(message))
    });
  } catch (error) {
    console.error("Blaze stake generate error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate Blaze stake transaction"
      },
      { status: 500 }
    );
  }
}
