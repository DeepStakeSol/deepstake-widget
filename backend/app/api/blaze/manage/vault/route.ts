import { type NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { ValidatorStakingError } from "@/utils/errors";
import { getRpcEndpoint } from "@/utils/solana/rpc";
import { VSOL_MINT } from "@/utils/consts";
import { getVaultBinding } from "@/utils/vaultBinding";
import { getStakebotStake } from "@/utils/stakebot";

type UiStatus = "ready" | "updating" | "low_balance" | "no_binding" | "error";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const wallet = searchParams.get("wallet");
    const network = searchParams.get("network");

    if (!wallet) {
      return NextResponse.json(
        { error: "wallet parameter is required" },
        { status: 400 }
      );
    }

    try {
      new PublicKey(wallet);
    } catch {
      return NextResponse.json(
        { error: "Invalid wallet address" },
        { status: 400 }
      );
    }

    const rpcUrl = getRpcEndpoint(network);
    if (!rpcUrl) {
      return NextResponse.json({ error: "RPC endpoint not configured" }, { status: 500 });
    }
    const connection = new Connection(rpcUrl);

    const [binding, stakebot] = await Promise.all([
      getVaultBinding(wallet, connection),
      getStakebotStake(wallet, connection),
    ]);

    const lstAta = getAssociatedTokenAddressSync(
      new PublicKey(VSOL_MINT),
      new PublicKey(wallet)
    );
    let vsolRaw = "0";
    try {
      const result = await connection.getTokenAccountBalance(lstAta);
      vsolRaw = result.value.amount;
    } catch {
      vsolRaw = "0";
    }
    const vsolUi = Number(vsolRaw) / 1e9;

    let uiStatus: UiStatus;
    if (!binding.hasBinding) {
      uiStatus = "no_binding";
    } else if (vsolUi < 1 && !stakebot.found) {
      uiStatus = "low_balance";
    } else if (stakebot.found) {
      uiStatus = "ready";
    } else {
      uiStatus = "updating";
    }

    return NextResponse.json({
      wallet,
      binding: {
        hasBinding: binding.hasBinding,
        validatorVoteKey: binding.hasBinding ? binding.stakeTarget : undefined,
      },
      balance: { vsol: vsolRaw },
      stakebot: {
        found: stakebot.found,
        generatedStake: stakebot.found ? stakebot.generatedStake : undefined,
        epoch: stakebot.epoch,
        sourceFile: stakebot.sourceFile,
      },
      uiStatus,
    });
  } catch (error) {
    console.error("Vault manage error:", error);
    if (error instanceof ValidatorStakingError) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: "Failed to fetch vault manage data" }, { status: 500 });
  }
}
