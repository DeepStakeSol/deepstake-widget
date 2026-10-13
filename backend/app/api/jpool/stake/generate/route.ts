import { type NextRequest, NextResponse } from "next/server";
import { address, isAddress } from "@solana/kit";

import { getJpoolStakePoolAddress } from "@/utils/consts";
import { parseStakeLamports } from "@/utils/solana/jpool/deposit";
import { JpoolRouteError } from "@/utils/solana/jpool/errors";
import { buildJpoolDepositTransaction } from "@/utils/solana/jpool/generate";
import { jpoolErrorResponse } from "@/utils/solana/jpool/response";

async function readRequest(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new JpoolRouteError("INVALID_REQUEST", 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new JpoolRouteError("INVALID_REQUEST", 400);
  }

  const { wallet, voteAccount, stakeLamports } = body as Record<
    string,
    unknown
  >;
  if (typeof wallet !== "string" || !isAddress(wallet)) {
    throw new JpoolRouteError("INVALID_WALLET", 400);
  }
  if (typeof voteAccount !== "string" || !isAddress(voteAccount)) {
    throw new JpoolRouteError("INVALID_VOTE_ACCOUNT", 400);
  }
  const lamports = parseStakeLamports(stakeLamports);
  if (lamports === null) {
    throw new JpoolRouteError("INVALID_STAKE_LAMPORTS", 400);
  }

  return {
    wallet: address(wallet),
    voteAccount: address(voteAccount),
    lamports
  };
}

export async function POST(request: NextRequest) {
  try {
    const network = request.nextUrl.searchParams.get("network") || "mainnet";
    if (!getJpoolStakePoolAddress(network)) {
      throw new JpoolRouteError("JPOOL_MAINNET_ONLY", 400);
    }

    const { wallet, voteAccount, lamports } = await readRequest(request);
    const { transaction, expectedJsol } = await buildJpoolDepositTransaction({
      network,
      wallet,
      voteAccount,
      lamports
    });

    return NextResponse.json({
      transaction,
      quote: { expectedJsol: expectedJsol.toString() }
    });
  } catch (error) {
    return jpoolErrorResponse(error, "JPool stake generate error:");
  }
}
