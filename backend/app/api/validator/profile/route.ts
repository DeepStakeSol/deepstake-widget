import { address, assertIsAddress } from "@solana/kit";
import { type NextRequest, NextResponse } from "next/server";

import { getValidatorProfile } from "@/utils/validatorProfile/service";
import type { ValidatorNetwork } from "@/utils/validatorProfile/types";
import { errorMessage, operationalLog } from "@/utils/observability/logger";
import { recordProfileResponse } from "@/utils/observability/metrics";

export const runtime = "nodejs";

const VALID_NETWORKS = new Set<ValidatorNetwork>(["mainnet", "devnet"]);

export async function GET(request: NextRequest) {
  const network = request.nextUrl.searchParams.get("network");
  const voteAccount = request.nextUrl.searchParams.get("voteAccount");

  if (!network || !VALID_NETWORKS.has(network as ValidatorNetwork)) {
    return NextResponse.json(
      { error: "network must be mainnet or devnet" },
      { status: 400 }
    );
  }
  if (!voteAccount) {
    return NextResponse.json(
      { error: "voteAccount parameter is required" },
      { status: 400 }
    );
  }

  try {
    const validatedVoteAccount = address(voteAccount);
    assertIsAddress(validatedVoteAccount);
  } catch {
    return NextResponse.json(
      { error: "Invalid voteAccount address" },
      { status: 400 }
    );
  }

  const startedAt = Date.now();
  try {
    const profile = await getValidatorProfile(
      network as ValidatorNetwork,
      voteAccount
    );
    recordProfileResponse(
      network as ValidatorNetwork,
      profile,
      Date.now() - startedAt
    );
    return NextResponse.json(profile);
  } catch (error) {
    recordProfileResponse(
      network as ValidatorNetwork,
      null,
      Date.now() - startedAt
    );
    operationalLog("error", "validator_profile_aggregation_failed", {
      network,
      elapsedMs: Date.now() - startedAt,
      error: errorMessage(error)
    });
    return NextResponse.json(
      { error: "Failed to aggregate validator profile" },
      { status: 500 }
    );
  }
}
