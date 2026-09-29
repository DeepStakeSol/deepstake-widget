import { type NextRequest, NextResponse } from "next/server";
import { isAddress } from "@solana/kit";

import { getJpoolStakePoolAddress } from "@/utils/consts";
import { getJpoolEligibility } from "@/utils/jpool/eligibility";
import { JpoolRouteError } from "@/utils/solana/jpool/errors";
import { jpoolErrorResponse } from "@/utils/solana/jpool/response";

// GET /api/jpool/eligibility?vote=&network=mainnet
// 200 { eligible, reason, epoch, source }. Upstream and RPC failures resolve
// to `{ eligible: true, source: "fallback" }`; only bad input is non-200.
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const network = params.get("network") || "mainnet";
    if (!getJpoolStakePoolAddress(network)) {
      throw new JpoolRouteError("JPOOL_MAINNET_ONLY", 400);
    }
    const vote = params.get("vote");
    if (!vote || !isAddress(vote)) {
      throw new JpoolRouteError("INVALID_VOTE_ACCOUNT", 400);
    }

    return NextResponse.json(await getJpoolEligibility(network, vote));
  } catch (error) {
    return jpoolErrorResponse(
      error,
      "JPool eligibility error:",
      "JPOOL_ELIGIBILITY_FAILED"
    );
  }
}
