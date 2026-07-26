import { type NextRequest, NextResponse } from "next/server";
import {
  address,
  appendTransactionMessageInstructions,
  compileTransaction,
  createNoopSigner,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  getBase64Encoder,
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
import { STAKE_POOL_ADDRESS, VSOL_MINT } from "@/utils/consts";
import { createRpcConnection, getRpcEndpoint } from "@/utils/solana/rpc";
import {
  decodeStakePoolAccount,
  findStakePoolWithdrawAuthority,
  getCreateAssociatedTokenAccountInstruction,
  getDepositSolInstruction,
  STAKE_POOL_PROGRAM_ADDRESS
} from "@/utils/solana/blaze/stake-pool";
import {
  decodeDirectorStakeTarget,
  decodeDstInfoAccount,
  DIRECTED_STAKE_PROGRAM_ADDRESS,
  DST_PROGRAM_ADDRESS,
  findDirectorAddress,
  findDstInfoAddress,
  getInitDirectorInstruction,
  getMintDstInstruction,
  getSetStakeTargetInstruction
} from "@/utils/solana/vault/instructions";

interface VaultMessageParams {
  wallet: Address;
  blockhashObject: Readonly<{
    blockhash: Blockhash;
    lastValidBlockHeight: bigint;
  }>;
  instructions: readonly IInstruction[];
  computeUnitLimit?: number;
  priorityFeeMicroLamports?: number;
}

function getVaultMessage({
  wallet,
  blockhashObject,
  instructions,
  computeUnitLimit,
  priorityFeeMicroLamports
}: VaultMessageParams) {
  const message = pipe(
    createTransactionMessage({ version: 0 }),
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

function decodeBase64(data: readonly [string, "base64"]): Uint8Array {
  return new Uint8Array(getBase64Encoder().encode(data[0]));
}

function lamportsToSol(lamports: bigint): number {
  return Number(lamports) / 1_000_000_000;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const wallet = searchParams.get("address");
  if (!wallet) {
    return NextResponse.json(
      { error: "Missing required parameter: address" },
      { status: 400 }
    );
  }
  const mint = searchParams.get("mint");
  if (!mint) {
    return NextResponse.json(
      { error: "Missing required parameter: mint" },
      { status: 400 }
    );
  }
  const amount = searchParams.get("amount");
  if (!amount) {
    return NextResponse.json(
      { error: "Missing required parameter: amount" },
      { status: 400 }
    );
  }
  const balance = searchParams.get("balance");
  if (!balance) {
    return NextResponse.json(
      { error: "Missing required parameter: balance" },
      { status: 400 }
    );
  }

  const network = searchParams.get("network") || "mainnet";
  const rpcUrl = getRpcEndpoint(network);
  if (!rpcUrl) {
    return NextResponse.json(
      { error: "RPC endpoint not configured" },
      { status: 500 }
    );
  }

  try {
    const walletAddress = address(wallet);
    const mintAddress = address(mint);
    const vsolMint = address(VSOL_MINT);
    const stakePoolAddress = address(STAKE_POOL_ADDRESS);
    const walletSigner = createNoopSigner(walletAddress);
    const rpc = createRpcConnection(network);
    const instructions: IInstruction[] = [];
    const target = searchParams.get("target");

    if (target) {
      if (mintAddress !== vsolMint) {
        return NextResponse.json(
          { error: "Must use vSOL mint for direct staking" },
          { status: 400 }
        );
      }
      const targetAddress = address(target);
      const director = await findDirectorAddress(walletAddress);
      const { value: directorAccount } = await rpc
        .getAccountInfo(director, {
          commitment: "confirmed",
          encoding: "base64"
        })
        .send();
      const isUpdatingExisting =
        directorAccount?.owner === DIRECTED_STAKE_PROGRAM_ADDRESS;
      let alreadyTargetsValidator = false;
      if (isUpdatingExisting && directorAccount) {
        try {
          alreadyTargetsValidator =
            decodeDirectorStakeTarget(decodeBase64(directorAccount.data)) ===
            targetAddress;
        } catch {
          // Match the legacy behavior: malformed data falls through to update.
        }
      }
      if (!alreadyTargetsValidator) {
        if (!isUpdatingExisting) {
          instructions.push(
            getInitDirectorInstruction({ authority: walletSigner, director })
          );
        }
        instructions.push(
          getSetStakeTargetInstruction({
            authority: walletSigner,
            director,
            stakeTarget: targetAddress
          })
        );
      }
    }

    const [vsolAta] = await findAssociatedTokenPda({
      owner: walletAddress,
      mint: vsolMint,
      tokenProgram: TOKEN_PROGRAM_ADDRESS
    });
    const [
      { value: vsolAtaAccount },
      { value: stakePoolAccount },
      payerBalance
    ] = await Promise.all([
      rpc
        .getAccountInfo(vsolAta, {
          commitment: "confirmed",
          encoding: "base64"
        })
        .send(),
      rpc
        .getAccountInfo(stakePoolAddress, {
          commitment: "confirmed",
          encoding: "base64"
        })
        .send(),
      rpc.getBalance(walletAddress, { commitment: "confirmed" }).send()
    ]);

    if (!stakePoolAccount) {
      throw new Error("Invalid stake pool account");
    }
    if (stakePoolAccount.owner !== STAKE_POOL_PROGRAM_ADDRESS) {
      throw new Error("Invalid stake pool account owner");
    }
    const stakePool = decodeStakePoolAccount(
      decodeBase64(stakePoolAccount.data)
    );
    if (stakePool.tokenProgram !== TOKEN_PROGRAM_ADDRESS) {
      throw new Error("Unsupported stake pool token program");
    }
    if (stakePool.poolMint !== vsolMint) {
      throw new Error("Unexpected Vault stake pool mint");
    }

    const requestedLamports = BigInt(amount);
    const availableLamports = BigInt(balance);
    const depositLamports =
      requestedLamports < availableLamports
        ? requestedLamports
        : availableLamports;
    if (payerBalance.value < depositLamports) {
      throw new Error(
        `Not enough SOL to deposit into pool. Maximum deposit amount is ${lamportsToSol(
          payerBalance.value
        )} SOL.`
      );
    }
    if (!vsolAtaAccount) {
      instructions.push(
        getCreateAssociatedTokenAccountInstruction({
          payer: walletSigner,
          ata: vsolAta,
          owner: walletAddress,
          mint: vsolMint
        })
      );
    }

    const withdrawAuthority =
      await findStakePoolWithdrawAuthority(stakePoolAddress);
    instructions.push(
      getDepositSolInstruction({
        stakePool: stakePoolAddress,
        withdrawAuthority,
        reserveStake: stakePool.reserveStake,
        fundingAccount: walletSigner,
        destinationPoolAccount: vsolAta,
        managerFeeAccount: stakePool.managerFeeAccount,
        referralPoolAccount: vsolAta,
        poolMint: stakePool.poolMint,
        lamports: depositLamports
      })
    );

    if (mintAddress !== vsolMint) {
      if (stakePool.totalLamports === BigInt(0)) {
        throw new Error("Invalid Vault stake pool balance");
      }
      const dst = await findDstInfoAddress(mintAddress);
      const [lstAta] = await findAssociatedTokenPda({
        owner: walletAddress,
        mint: mintAddress,
        tokenProgram: TOKEN_PROGRAM_ADDRESS
      });
      const [{ value: dstAccount }, { value: lstAtaAccount }] =
        await Promise.all([
          rpc
            .getAccountInfo(dst, {
              commitment: "confirmed",
              encoding: "base64"
            })
            .send(),
          rpc
            .getAccountInfo(lstAta, {
              commitment: "confirmed",
              encoding: "base64"
            })
            .send()
        ]);
      if (!dstAccount || dstAccount.owner !== DST_PROGRAM_ADDRESS) {
        throw new Error("Invalid DST account");
      }
      const dstInfo = decodeDstInfoAccount(decodeBase64(dstAccount.data));
      if (dstInfo.tokenMint !== mintAddress) {
        throw new Error("DST mint does not match requested mint");
      }
      if (!lstAtaAccount) {
        instructions.push(
          getCreateAssociatedTokenAccountInstruction({
            payer: walletSigner,
            ata: lstAta,
            owner: walletAddress,
            mint: mintAddress
          })
        );
      }
      const outputAmount =
        (depositLamports * stakePool.poolTokenSupply) / stakePool.totalLamports;
      instructions.push(
        getMintDstInstruction({
          dst,
          vsolReserves: dstInfo.vsolReserves,
          sourceVsolAccount: vsolAta,
          owner: walletSigner,
          dstTokenAccount: lstAta,
          tokenMint: mintAddress,
          amount: outputAmount
        })
      );
    }

    const { value: latestBlockhash } = await rpc
      .getLatestBlockhash({ commitment: "finalized" })
      .send();
    const sampleMessage = getVaultMessage({
      wallet: walletAddress,
      blockhashObject: latestBlockhash,
      instructions
    });
    const sampleTransaction = compileTransaction(sampleMessage);
    const sampleWireTransaction =
      getBase64EncodedWireTransaction(sampleTransaction);
    const priorityTransaction = {
      serialize: () => getBase64Encoder().encode(sampleWireTransaction)
    };
    const [{ priorityFeeEstimate: microLamports }, simulation] =
      await Promise.all([
        getPriorityFeeEstimate("Medium", priorityTransaction, rpcUrl),
        rpc
          .simulateTransaction(sampleWireTransaction, {
            commitment: "confirmed",
            encoding: "base64"
          })
          .send()
      ]);
    if (simulation.value.err) {
      return NextResponse.json(
        {
          error: "Vault transaction simulation failed",
          details: simulation.value.err
        },
        { status: 400 }
      );
    }
    const units =
      Number(simulation.value.unitsConsumed ?? BigInt(200_000)) + 3_000;
    const message = getVaultMessage({
      wallet: walletAddress,
      blockhashObject: latestBlockhash,
      instructions,
      computeUnitLimit: units,
      priorityFeeMicroLamports: microLamports
    });

    return NextResponse.json({
      transaction: getBase64EncodedWireTransaction(compileTransaction(message))
    });
  } catch (error) {
    console.error("Vault stake error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate Vault stake transaction"
      },
      { status: 500 }
    );
  }
}
