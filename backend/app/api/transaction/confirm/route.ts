import { NextResponse } from "next/server";
import { confirmTransaction } from "@/utils/solana/status";

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const network = searchParams.get("network") || "devnet";

  try {
    const { txid, targetCommitment, timeout, interval } = await request.json();

    if (!txid) {
      return NextResponse.json(
        { error: "Missing required parameter: txid" },
        { status: 400 }
      );
    }

    await confirmTransaction({ network, txid, targetCommitment, timeout, interval });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Failed to confirm transaction" },
      { status: 500 }
    );
  }
}
