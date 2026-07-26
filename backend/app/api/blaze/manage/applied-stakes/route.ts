import { type NextRequest, NextResponse } from "next/server";
import { address } from "@solana/kit";

import { getBlazeAppliedStakes } from "@/utils/walletData/providers";
import { parseWalletNetwork } from "@/utils/walletData/network";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const wallet = params.get("wallet");
  const network = parseWalletNetwork(params.get("network"), "mainnet");
  const forceRefresh = params.get("refresh") === "true";

  if (!network)
    return NextResponse.json({ error: "Invalid network" }, { status: 400 });
  if (!wallet)
    return NextResponse.json(
      { error: "wallet parameter is required" },
      { status: 400 }
    );
  try {
    address(wallet);
  } catch {
    return NextResponse.json(
      { error: "Invalid wallet address" },
      { status: 400 }
    );
  }

  try {
    const appliedStakes = await getBlazeAppliedStakes(
      network,
      wallet,
      forceRefresh
    );
    return NextResponse.json({ appliedStakes });
  } catch (error) {
    console.error("Blaze applied stakes error:", error);
    return NextResponse.json(
      { error: "Failed to fetch Blaze applied stakes" },
      { status: 502 }
    );
  }
}
