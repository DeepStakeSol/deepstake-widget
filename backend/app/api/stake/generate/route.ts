import { NextResponse } from "next/server";
import { address, assertIsAddress } from "@solana/kit";

import { createRpcConnection } from "@/utils/solana/rpc";
import {
  buildNativeStakeTransaction,
  getErrorDetails,
  StakeGenerateError
} from "@/utils/solana/stake/generate";

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

    const authority = address(stakerAddress);
    const newAccount = address(newAccountAddress);
    const voteAccountAddress = address(voteAccount);
    assertIsAddress(authority);
    assertIsAddress(newAccount);
    assertIsAddress(voteAccountAddress);

    const wireTransaction = await buildNativeStakeTransaction({
      network,
      rpc: createRpcConnection(network),
      stakeLamports,
      authority,
      newAccount,
      voteAccount: voteAccountAddress
    });

    return NextResponse.json({
      wireTransaction
    });
  } catch (error) {
    if (error instanceof StakeGenerateError) {
      return NextResponse.json(error.body, { status: error.status });
    }
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
