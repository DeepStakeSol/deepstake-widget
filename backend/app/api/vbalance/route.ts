import { type NextRequest, NextResponse } from "next/server";
import { address } from "@solana/kit";
import {
  findAssociatedTokenPda,
  TOKEN_PROGRAM_ADDRESS
} from "@solana-program/token";

import { ValidatorStakingError } from "@/utils/errors";
import { createRpcConnection } from "@/utils/solana/rpc";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const wallet = searchParams.get("address");
    const network = searchParams.get("network");

    if (!wallet) {
      return NextResponse.json(
        { error: "Address parameter is required" },
        { status: 400 }
      );
    }
    const mint = searchParams.get("mint");
    if (!mint) {
      return NextResponse.json(
        { error: "mint parameter is required" },
        { status: 400 }
      );
    }

    const walletAddress = address(wallet);
    const mintAddress = address(mint);
    const rpc = createRpcConnection(network);
    const [lstAta] = await findAssociatedTokenPda({
      owner: walletAddress,
      mint: mintAddress,
      tokenProgram: TOKEN_PROGRAM_ADDRESS
    });
    const { value: sol } = await rpc
      .getBalance(walletAddress, { commitment: "confirmed" })
      .send();

    let lst = "0";
    try {
      const result = await rpc
        .getTokenAccountBalance(lstAta, { commitment: "confirmed" })
        .send();
      lst = result.value.amount;
    } catch {
      lst = "0";
    }
    return NextResponse.json({ sol: sol.toString(), lst });
  } catch (error) {
    console.error("Balance fetch error:", error);
    if (error instanceof ValidatorStakingError) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Failed to fetch vbalance" },
      { status: 500 }
    );
  }
}
