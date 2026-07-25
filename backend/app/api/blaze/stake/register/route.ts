import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";

import { invalidateWalletData } from "@/utils/walletData/service";
import { parseWalletNetwork } from "@/utils/walletData/network";

export async function POST(request: Request) {
  const network = parseWalletNetwork(
    new URL(request.url).searchParams.get("network"),
    "mainnet"
  );
  if (!network)
    return NextResponse.json({ error: "Invalid network" }, { status: 400 });
  try {
    const { validator, txid, wallet } = (await request.json()) as Record<
      string,
      unknown
    >;
    if (
      typeof validator !== "string" ||
      typeof txid !== "string" ||
      typeof wallet !== "string"
    ) {
      return NextResponse.json(
        { error: "validator, txid, and wallet are required" },
        { status: 400 }
      );
    }
    try {
      new PublicKey(validator);
      new PublicKey(wallet);
    } catch {
      return NextResponse.json(
        { error: "Invalid validator or wallet address" },
        { status: 400 }
      );
    }
    if (!txid.trim())
      return NextResponse.json({ error: "txid is required" }, { status: 400 });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    let response: Response;
    try {
      response = await fetch(
        `https://stake.solblaze.org/api/v1/cls_stake?validator=${encodeURIComponent(validator)}&txid=${encodeURIComponent(txid)}`,
        { signal: controller.signal }
      );
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok)
      throw new Error(
        `Blaze CLS registration returned HTTP ${response.status}`
      );

    await invalidateWalletData("blaze-applied", network, wallet);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Blaze CLS registration error:", error);
    return NextResponse.json(
      { error: "Failed to register Blaze CLS stake" },
      { status: 502 }
    );
  }
}
