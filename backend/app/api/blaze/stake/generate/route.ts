import { type NextRequest, NextResponse } from "next/server";
import {
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from "@solana/spl-token";
import {
  getStakePoolAccount,
  STAKE_POOL_PROGRAM_ID,
  StakePoolInstruction,
  stakePoolInfo,
} from "@solana/spl-stake-pool";
import { getRpcEndpoint } from "@/utils/solana/rpc";
import { getPriorityFeeEstimate } from "@/utils/priorityFee";
import {
  BSOL_MINT,
  getBlazeStakePoolAddress,
  getBlazeUpdatePoolUrl,
} from "@/utils/consts";

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

    const connection = new Connection(rpcUrl);
    const walletPubkey = new PublicKey(wallet);
    const stakePoolAddr = new PublicKey(getBlazeStakePoolAddress(network));
    const bsolMint = new PublicKey(BSOL_MINT);

    const info = await stakePoolInfo(connection, stakePoolAddr);
    if (info.details.updateRequired) {
      try {
        await fetch(getBlazeUpdatePoolUrl(network));
      } catch {
        // proceed even if the update call fails
      }
    }

    const bsolAta = getAssociatedTokenAddressSync(bsolMint, walletPubkey);
    let createAtaIx: TransactionInstruction | null = null;
    try {
      await getAccount(connection, bsolAta);
    } catch {
      createAtaIx = createAssociatedTokenAccountInstruction(
        walletPubkey,
        bsolAta,
        walletPubkey,
        bsolMint
      );
    }

    const [withdrawAuthority] = await PublicKey.findProgramAddress(
      [stakePoolAddr.toBuffer(), Buffer.from("withdraw")],
      STAKE_POOL_PROGRAM_ID,
    );
    const stakePoolAccount = await getStakePoolAccount(connection, stakePoolAddr);
    const stakePool = stakePoolAccount.account.data;

    const { blockhash } = await connection.getLatestBlockhash("finalized");

    const ixs: TransactionInstruction[] = [];
    if (createAtaIx) ixs.push(createAtaIx);
    ixs.push(
      StakePoolInstruction.depositSol({
        stakePool: stakePoolAddr,
        reserveStake: stakePool.reserveStake,
        fundingAccount: walletPubkey,
        destinationPoolAccount: bsolAta,
        managerFeeAccount: stakePool.managerFeeAccount,
        referralPoolAccount: bsolAta,
        poolMint: stakePool.poolMint,
        lamports: stakeLamports,
        withdrawAuthority,
      }),
    );

    if (voteIdentity) {
      const memo = JSON.stringify({
        type: "cls/validator_stake/lamports",
        value: { validator: voteIdentity },
      });
      ixs.push(
        new TransactionInstruction({
          keys: [{ pubkey: walletPubkey, isSigner: true, isWritable: true }],
          programId: new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"),
          data: Buffer.from(new TextEncoder().encode(memo)),
        })
      );
    }

    const testMessage = new TransactionMessage({
      recentBlockhash: blockhash,
      instructions: ixs,
      payerKey: walletPubkey,
    }).compileToV0Message();
    const testTx = new VersionedTransaction(testMessage);

    const { priorityFeeEstimate: microLamports } = await getPriorityFeeEstimate("Medium", testTx, rpcUrl);
    const sim = await connection.simulateTransaction(testTx);
    const units = (sim.value.unitsConsumed ?? 200_000) + 3000;

    ixs.unshift(ComputeBudgetProgram.setComputeUnitPrice({ microLamports }));
    ixs.unshift(ComputeBudgetProgram.setComputeUnitLimit({ units }));

    const transaction = new Transaction();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = walletPubkey;
    transaction.add(...ixs);

    const serialized = transaction.serialize({
      verifySignatures: false,
      requireAllSignatures: false,
    });

    return NextResponse.json({
      transaction: Buffer.from(serialized).toString("base64"),
    });
  } catch (error) {
    console.error("Blaze stake generate error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate Blaze stake transaction",
      },
      { status: 500 }
    );
  }
}
