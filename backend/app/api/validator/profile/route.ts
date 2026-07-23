import { address, assertIsAddress } from "@solana/kit";
import { type NextRequest, NextResponse } from "next/server";

import { getValidatorProfile } from "@/utils/validatorProfile/service";
import type { ValidatorNetwork } from "@/utils/validatorProfile/types";

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

  try {
    const profile = await getValidatorProfile(
      network as ValidatorNetwork,
      voteAccount
    );
    return NextResponse.json(profile);
  } catch (error) {
    console.error("Validator profile aggregation failed", error);
    return NextResponse.json(
      { error: "Failed to aggregate validator profile" },
      { status: 500 }
    );
  }
}
