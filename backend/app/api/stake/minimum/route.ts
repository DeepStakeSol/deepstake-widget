import { type NextRequest, NextResponse } from "next/server";

import { createRpcConnection } from "@/utils/solana/rpc";
import {
  getStakeMinimum,
  STAKE_MINIMUM_CACHE_TTL_MS
} from "@/utils/solana/stake/minimum";

const VALID_NETWORKS = new Set(["mainnet", "devnet"]);

export async function GET(request: NextRequest) {
  const network = request.nextUrl.searchParams.get("network");
  if (!network || !VALID_NETWORKS.has(network)) {
    return NextResponse.json(
      { error: "network must be mainnet or devnet" },
      { status: 400 }
    );
  }

  try {
    const minimum = await getStakeMinimum(
      network,
      createRpcConnection(network)
    );
    return NextResponse.json(minimum, {
      headers: {
        "Cache-Control":
          "public, max-age=" + STAKE_MINIMUM_CACHE_TTL_MS / 1_000
      }
    });
  } catch (error) {
    console.error("Stake minimum fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch stake minimum" },
      { status: 500 }
    );
  }
}
