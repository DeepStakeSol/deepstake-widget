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
  const searchParams = request.nextUrl.searchParams;
  const wallet = searchParams.get("wallet");
  const network = searchParams.get("network");

  try {
    console.log("[VaultManage] Request started", { wallet, network });

    if (!wallet) {
      console.log("[VaultManage] Missing wallet parameter", { network });
      return NextResponse.json(
        { error: "wallet parameter is required" },
        { status: 400 }
      );
    }

    try {
      new PublicKey(wallet);
    } catch {
      console.log("[VaultManage] Invalid wallet address", { wallet, network });
      return NextResponse.json(
        { error: "Invalid wallet address" },
        { status: 400 }
      );
    }

    const rpcUrl = getRpcEndpoint(network);
    if (!rpcUrl) {
      console.log("[VaultManage] RPC endpoint not configured", { network });
      return NextResponse.json(
        { error: "RPC endpoint not configured" },
        { status: 500 }
      );
    }
    console.log("[VaultManage] RPC endpoint resolved", {
      wallet,
      network,
      hasRpcUrl: Boolean(rpcUrl)
    });

    const connection = new Connection(rpcUrl);

    console.log("[VaultManage] Loading binding and stakebot data", {
      wallet,
      network
    });
    const [binding, stakebot] = await Promise.all([
      getVaultBinding(wallet, connection),
      getStakebotStake(wallet, connection)
    ]);
    console.log("[VaultManage] Binding and stakebot results", {
      wallet,
      network,
      binding,
      stakebot
    });

    const lstAta = getAssociatedTokenAddressSync(
      new PublicKey(VSOL_MINT),
      new PublicKey(wallet)
    );
    console.log("[VaultManage] vSOL ATA resolved", {
      wallet,
      network,
      mint: VSOL_MINT,
      ata: lstAta.toBase58()
    });

    let vsolRaw = "0";
    try {
      const result = await connection.getTokenAccountBalance(lstAta);
      vsolRaw = result.value.amount;
      console.log("[VaultManage] vSOL token balance loaded", {
        wallet,
        network,
        vsolRaw,
        decimals: result.value.decimals,
        uiAmountString: result.value.uiAmountString
      });
    } catch {
      vsolRaw = "0";
      console.log("[VaultManage] vSOL token balance unavailable, using zero", {
        wallet,
        network,
        ata: lstAta.toBase58()
      });
    }
    const vsolUi = Number(vsolRaw) / 1e9;
    console.log("[VaultManage] vSOL UI balance computed", {
      wallet,
      network,
      vsolRaw,
      vsolUi
    });

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

    console.log("[VaultManage] UI status decided", {
      wallet,
      network,
      uiStatus,
      hasBinding: binding.hasBinding,
      validatorVoteKey: binding.hasBinding ? binding.stakeTarget : undefined,
      vsolUi,
      stakebotFound: stakebot.found,
      generatedStake: stakebot.generatedStake,
      stakebotEpoch: stakebot.epoch,
      stakebotSourceFile: stakebot.sourceFile
    });

    return NextResponse.json({
      wallet,
      binding: {
        hasBinding: binding.hasBinding,
        validatorVoteKey: binding.hasBinding ? binding.stakeTarget : undefined
      },
      balance: { vsol: vsolRaw },
      stakebot: {
        found: stakebot.found,
        generatedStake: stakebot.found ? stakebot.generatedStake : undefined,
        epoch: stakebot.epoch,
        sourceFile: stakebot.sourceFile
      },
      uiStatus
    });
  } catch (error) {
    console.error("Vault manage error:", error);
    console.log("[VaultManage] Request failed", {
      wallet,
      network,
      error: error instanceof Error ? error.message : String(error)
    });
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
