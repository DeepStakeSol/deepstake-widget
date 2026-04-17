import { type NextRequest, NextResponse } from "next/server";
import { ValidatorStakingError } from "@/utils/errors";
import { createRpcConnection } from "@/utils/solana/rpc";
import { getEpochInfo } from "@/utils/solana/stake/get-epoch-info";

/**
 * Get the stake accounts for a wallet address and optionally filtered by vote account
 * @param request - The request object
 * @returns The stake accounts associated with the wallet address
 * Endpoint: /api/stake?owner=<address>&vote=<address>
 */

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const network = searchParams.get("network");

  try {

        const rpc = createRpcConnection(network);

        const epochInfo = await getEpochInfo({
          rpc,
        });

        return NextResponse.json({ epochInfo });
  } catch (error) {
    console.error("epochInfo fetch error:", error);
    if (error instanceof ValidatorStakingError) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Failed to fetch epochInfo" },
      { status: 500 }
    );
  }
}
