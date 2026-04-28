import { type NextRequest, NextResponse } from "next/server";
import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from "@solana/spl-token";
import { depositSol, stakePoolInfo } from "@solana/spl-stake-pool";
import { getRpcEndpoint } from "@/utils/solana/rpc";
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

    const depositTx = await depositSol(
      connection,
      stakePoolAddr,
      walletPubkey,
      stakeLamports,
      undefined,
      bsolAta
    );

    const { blockhash } = await connection.getLatestBlockhash("finalized");

    const transaction = new Transaction();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = walletPubkey;

    if (createAtaIx) {
      transaction.add(createAtaIx);
    }
    transaction.add(...depositTx.instructions);

    if (voteIdentity) {
      const memo = JSON.stringify({
        type: "cls/validator_stake/lamports",
        value: { validator: voteIdentity },
      });
      transaction.add(
        new TransactionInstruction({
          keys: [{ pubkey: walletPubkey, isSigner: true, isWritable: true }],
          programId: new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"),
          data: Buffer.from(new TextEncoder().encode(memo)),
        })
      );
    }

    if (depositTx.signers.length > 0) {
      transaction.partialSign(...depositTx.signers);
    }

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
