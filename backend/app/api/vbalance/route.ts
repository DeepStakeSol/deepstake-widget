import { type NextRequest, NextResponse } from "next/server";
import { ValidatorStakingError } from "@/utils/errors";

import {
  Connection,
  PublicKey,
} from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { getRpcEndpoint } from "@/utils/solana/rpc";


/**
 * Get the balance of a wallet address
 * @param request - The request object
 * @returns The balance of the wallet address
 * Endpoint: /api/balance?address=<address>
 */

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const walletAddress = searchParams.get("address");
    const network = searchParams.get("network");

    //const rpcUrl = process.env.VITE_MAINNET_RPC_ENDPOINT;
    const rpcUrl = getRpcEndpoint(network);
    if (!rpcUrl) {
      throw new Error("RPC_URL is required");
    }

    const connection = new Connection(rpcUrl);

    if (!walletAddress) {
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
    
    const sol = await connection.getBalance(new PublicKey(walletAddress));
    const lstAta = await getAssociatedTokenAddressSync(
      new PublicKey(mint),
      new PublicKey(walletAddress),
    );
    let lst: string;
    try {
      const result = await connection.getTokenAccountBalance(lstAta);
      console.log("result", result);
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
