import { type NextRequest, NextResponse } from "next/server";
import { isAddress } from "@solana/kit";

import { getJpoolStakePoolAddress } from "@/utils/consts";
import { JpoolRouteError } from "@/utils/solana/jpool/errors";
import { jpoolErrorResponse } from "@/utils/solana/jpool/response";
import { getJpoolManage } from "@/utils/walletData/providers";

// GET /api/jpool/manage?wallet=&vote=&network=mainnet&refresh=true
// Upstream failures degrade per source (see `sources`) and still return 200.
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const network = params.get("network") || "mainnet";
    if (!getJpoolStakePoolAddress(network)) {
      throw new JpoolRouteError("JPOOL_MAINNET_ONLY", 400);
    }
    const wallet = params.get("wallet");
    if (!wallet || !isAddress(wallet)) {
      throw new JpoolRouteError("INVALID_WALLET", 400);
    }
    const vote = params.get("vote");
    if (!vote || !isAddress(vote)) {
      throw new JpoolRouteError("INVALID_VOTE_ACCOUNT", 400);
    }

    return NextResponse.json(
      await getJpoolManage(network, wallet, vote, params.get("refresh") === "true")
    );
  } catch (error) {
    return jpoolErrorResponse(error, "JPool manage error:", "JPOOL_MANAGE_FAILED");
  }
}
