import { type NextRequest, NextResponse } from "next/server";
import { address } from "@solana/kit";

import { ValidatorStakingError } from "@/utils/errors";
import { createRpcConnection } from "@/utils/solana/rpc";
import { getStakeAccounts } from "@/utils/solana/stake/get-stake-accounts";
import { getNativeStakeAccounts } from "@/utils/walletData/providers";
import { parseWalletNetwork } from "@/utils/walletData/network";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const network = parseWalletNetwork(searchParams.get("network"), "devnet");
    const ownerAddress = searchParams.get("owner");
    const voteAddress = searchParams.get("vote");
    const forceRefresh = searchParams.get("refresh") === "true";

    if (!network) {
      return NextResponse.json({ error: "Invalid network" }, { status: 400 });
    }

    if (!ownerAddress) {
      return NextResponse.json(
        { error: "Owner address parameter is required" },
        { status: 400 }
      );
    }

    // Vote-filtered reads have a different result shape per vote account and remain uncached.
    const stakeAccounts = voteAddress
      ? await getStakeAccounts({
          rpc: createRpcConnection(network),
          owner: address(ownerAddress),
          vote: address(voteAddress)
        })
      : await getNativeStakeAccounts(network, ownerAddress, forceRefresh);

    return NextResponse.json({ stakeAccounts });
  } catch (error) {
    console.error("Stake accounts fetch error:", error);
    if (error instanceof ValidatorStakingError) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Failed to fetch stake accounts" },
      { status: 500 }
    );
  }
}
