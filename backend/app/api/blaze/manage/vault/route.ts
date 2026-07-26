import { type NextRequest, NextResponse } from "next/server";
import { address } from "@solana/kit";

import { ValidatorStakingError } from "@/utils/errors";
import { getVaultManage } from "@/utils/walletData/providers";
import { parseWalletNetwork } from "@/utils/walletData/network";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const wallet = searchParams.get("wallet");
  const network = parseWalletNetwork(searchParams.get("network"), "devnet");
  const forceRefresh = searchParams.get("refresh") === "true";

  try {
    if (!network)
      return NextResponse.json({ error: "Invalid network" }, { status: 400 });
    if (!wallet) {
      return NextResponse.json(
        { error: "wallet parameter is required" },
        { status: 400 }
      );
    }
    try {
      address(wallet);
    } catch {
      return NextResponse.json(
        { error: "Invalid wallet address" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      await getVaultManage(network, wallet, forceRefresh)
    );
  } catch (error) {
    console.error("Vault manage error:", error);
    if (error instanceof ValidatorStakingError) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Failed to fetch vault manage data" },
      { status: 500 }
    );
  }
}
