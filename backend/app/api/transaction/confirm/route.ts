import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";

import { confirmTransaction } from "@/utils/solana/status";
import {
  invalidateMutationData,
  isWalletMutation,
  type CacheMutationContext
} from "@/utils/walletData/mutations";
import { parseWalletNetwork } from "@/utils/walletData/network";

function parseMutationContext(
  value: unknown
): CacheMutationContext | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.walletAddress !== "string" || !isWalletMutation(raw.mutation))
    return null;
  try {
    new PublicKey(raw.walletAddress);
  } catch {
    return null;
  }
  return { walletAddress: raw.walletAddress, mutation: raw.mutation };
}

export async function POST(request: Request) {
  const network = parseWalletNetwork(
    new URL(request.url).searchParams.get("network"),
    "devnet"
  );
  if (!network)
    return NextResponse.json({ error: "Invalid network" }, { status: 400 });

  try {
    const { txid, targetCommitment, timeout, interval, cacheMutation } =
      await request.json();
    if (!txid) {
      return NextResponse.json(
        { error: "Missing required parameter: txid" },
        { status: 400 }
      );
    }

    const mutationContext = parseMutationContext(cacheMutation);
    if (mutationContext === null) {
      return NextResponse.json(
        { error: "Invalid cache mutation context" },
        { status: 400 }
      );
    }

    await confirmTransaction({
      network,
      txid,
      targetCommitment: mutationContext ? "confirmed" : targetCommitment,
      timeout,
      interval
    });

    if (mutationContext) {
      await invalidateMutationData(network, mutationContext);
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Failed to confirm transaction" },
      { status: 500 }
    );
  }
}
