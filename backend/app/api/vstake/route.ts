import { type NextRequest, NextResponse } from "next/server";









import {
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { getDirectInstruction } from '@/utils/getDirectInstruction';
import { getStakeInstruction } from "@/utils/stakeInstruction";
import BigNumber from "bignumber.js";
import { getPriorityFeeEstimate } from '@/utils/priorityFee';
import { getRpcEndpoint } from "@/utils/solana/rpc";



const VSOL_MINT = "vSoLxydx6akxyMD9XEcPvGYNGq6Nn66oqVb3UkGkei7";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  const address = searchParams.get("address");
  if (!address) {
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
    const connection = new Connection(rpcUrl);
    const target = searchParams.get("target");
    const ixs: TransactionInstruction[] = [];

    if (target) {
      if (mint !== VSOL_MINT) {
        return NextResponse.json(
          { error: "Must use vSOL mint for direct staking" },
          { status: 400 }
        );
      }
      ixs.push(...await getDirectInstruction(address, target, connection));
    }

    ixs.push(...await getStakeInstruction(
      new PublicKey(mint),
      new PublicKey(address),
      new BigNumber(amount),
      new BigNumber(balance),
      PublicKey.default,
      connection,
    ));

    const recentBlockhash = await connection.getLatestBlockhash();

    const testMessage = new TransactionMessage({
      recentBlockhash: recentBlockhash.blockhash,
      instructions: ixs,
      payerKey: new PublicKey(address),
    }).compileToV0Message();
    const testTx = new VersionedTransaction(testMessage);

    const { priorityFeeEstimate: microLamports } = await getPriorityFeeEstimate("Medium", testTx, rpcUrl);
    const sim = await connection.simulateTransaction(testTx);
    if (sim.value.err) {
      return NextResponse.json(
        { error: "Vault transaction simulation failed", details: sim.value.err },
        { status: 400 }
      );
    }
    const units = (sim.value.unitsConsumed ?? 200_000) + 3000;

    ixs.unshift(ComputeBudgetProgram.setComputeUnitPrice({ microLamports }));
    ixs.unshift(ComputeBudgetProgram.setComputeUnitLimit({ units }));

    const message = new TransactionMessage({
      recentBlockhash: recentBlockhash.blockhash,
      instructions: ixs,
      payerKey: new PublicKey(address),
    }).compileToV0Message();
    const tx = new VersionedTransaction(message);

    return NextResponse.json({
      transaction: Buffer.from(tx.serialize()).toString("base64"),
    });
  } catch (error) {
    console.error("Vault stake error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error
          ? error.message
          : "Failed to generate Vault stake transaction",
      },
      { status: 500 }
    );
  }
}
