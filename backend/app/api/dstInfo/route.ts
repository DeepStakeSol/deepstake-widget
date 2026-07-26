import { type NextRequest, NextResponse } from "next/server";

import { getAllDSTs } from "@/utils/dstFetch";
import { ValidatorStakingError } from "@/utils/errors";
import { getMetadata } from "@/utils/metadataFetch";
import { createRpcConnection, getRpcEndpoint } from "@/utils/solana/rpc";
import { removeBigint } from "@/utils/utils";
import { parseWalletNetwork } from "@/utils/walletData/network";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mint = searchParams.get("mint");
  const network = parseWalletNetwork(searchParams.get("network"), "mainnet");

  try {
    if (!network) {
      return NextResponse.json({ error: "Invalid network" }, { status: 400 });
    }
    const rpcUrl = getRpcEndpoint(network);
    if (!rpcUrl) throw new Error("RPC_URL is required");

    const rpc = createRpcConnection(network);
    const dsts = await getAllDSTs(rpc);
    const dst = dsts.find((candidate) => candidate.data.tokenMint === mint);
    if (!dst || !mint) {
      return NextResponse.json({ error: "DST not found" }, { status: 404 });
    }

    const metadata = await getMetadata(mint, rpc);
    if (!metadata) {
      return NextResponse.json(
        { error: "Metadata not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(removeBigint({ metadata, dst }));
  } catch (error) {
    console.error("DST fetch error:", error);
    if (error instanceof ValidatorStakingError) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: "Failed to fetch DST" }, { status: 500 });
  }
}
