import { type NextRequest, NextResponse } from "next/server";
import { ValidatorStakingError } from "@/utils/errors";
import { address } from "@solana/kit";

import { getAllDSTs } from "@/utils/dstFetch";
import { getMetadata } from "@/utils/metadataFetch";
import { removeBigint } from "@/utils/utils";

import {
  Connection,
} from "@solana/web3.js";

const rpcUrl = process.env.VITE_MAINNET_RPC_ENDPOINT;
if (!rpcUrl) {
  throw new Error("RPC_URL is required");
}

console.log("rpcUrl", rpcUrl);

const connection = new Connection(rpcUrl);

/**
 * Get the balance of a wallet address
 * @param request - The request object
 * @returns The balance of the wallet address
 * Endpoint: /api/balance?address=<address>
 */

export async function GET(request: NextRequest) {

  const searchParams = request.nextUrl.searchParams;
  const mint = searchParams.get("mint");  

  try {
    
    const dsts = await getAllDSTs(connection);
    const dst = dsts.find((dst) => dst.data.tokenMint.toString() === mint);
    if (!dst) {
      return NextResponse.json(
          { error: "DST not found" },
          { status: 404 }
        );
    }

    const metadata = await getMetadata(mint);
    if (!metadata) {
      return NextResponse.json(
          { error: "Metadata not found" },
          { status: 404 }
        );
    }

    //return reply.send(removeBigint({ metadata, dst }));
    return NextResponse.json(removeBigint({ metadata, dst }));
  } catch (error) {
    console.error("DST fetch error:", error);
    if (error instanceof ValidatorStakingError) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Failed to fetch DST" },
      { status: 500 }
    );
  }
}
