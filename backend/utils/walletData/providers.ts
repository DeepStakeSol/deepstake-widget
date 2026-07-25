import { address } from "@solana/kit";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Connection, PublicKey } from "@solana/web3.js";

import { VSOL_MINT } from "../consts";
import { createRpcConnection, getRpcEndpoint } from "../solana/rpc";
import {
  getStakeAccounts,
  type GetStakeAccountResponse
} from "../solana/stake/get-stake-accounts";
import { getStakebotStake } from "../stakebot";
import { getVaultBinding } from "../vaultBinding";
import { getWalletData, WALLET_CACHE_POLICIES } from "./service";

export interface BlazeAppliedStake {
  voteAcc: string;
  amount: number;
}

export interface VaultManageResponse {
  wallet: string;
  binding: { hasBinding: boolean; validatorVoteKey?: string };
  balance: { vsol: string };
  stakebot: {
    found: boolean;
    generatedStake?: string;
    epoch?: number;
    sourceFile?: string;
    sourceUrl?: string;
  };
  uiStatus: "ready" | "updating" | "low_balance" | "no_binding" | "error";
  message?: string;
}

export async function fetchNativeStakeAccounts(
  network: string,
  wallet: string
): Promise<GetStakeAccountResponse[]> {
  return getStakeAccounts({
    rpc: createRpcConnection(network),
    owner: address(wallet)
  });
}

export function getNativeStakeAccounts(
  network: string,
  wallet: string,
  forceRefresh = false
): Promise<GetStakeAccountResponse[]> {
  return getWalletData({
    resource: "native-stake",
    network,
    wallet,
    forceRefresh,
    policy: WALLET_CACHE_POLICIES.native,
    fetcher: () => fetchNativeStakeAccounts(network, wallet)
  });
}

export async function fetchBlazeAppliedStakes(
  wallet: string
): Promise<BlazeAppliedStake[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(
      `https://stake.solblaze.org/api/v1/cls_applied_user_stake?address=${encodeURIComponent(wallet)}`,
      { signal: controller.signal }
    );
    if (!response.ok)
      throw new Error(`Blaze applied stakes returned HTTP ${response.status}`);
    const body = (await response.json()) as {
      success?: boolean;
      applied_stakes?: Record<string, unknown>;
    };
    if (!body.success || !body.applied_stakes) return [];
    return Object.entries(body.applied_stakes).flatMap(
      ([voteAcc, rawAmount]) => {
        const amount = Number(rawAmount);
        return voteAcc && Number.isFinite(amount) && amount >= 0
          ? [{ voteAcc, amount }]
          : [];
      }
    );
  } finally {
    clearTimeout(timeout);
  }
}

export function getBlazeAppliedStakes(
  network: string,
  wallet: string,
  forceRefresh = false
): Promise<BlazeAppliedStake[]> {
  if (network === "devnet") return Promise.resolve([]);
  return getWalletData({
    resource: "blaze-applied",
    network,
    wallet,
    forceRefresh,
    policy: WALLET_CACHE_POLICIES.blaze,
    fetcher: () => fetchBlazeAppliedStakes(wallet)
  });
}

export async function fetchVaultManage(
  network: string,
  wallet: string
): Promise<VaultManageResponse> {
  const rpcUrl = getRpcEndpoint(network);
  if (!rpcUrl) throw new Error("RPC endpoint not configured");
  const connection = new Connection(rpcUrl);
  const [binding, stakebot] = await Promise.all([
    getVaultBinding(wallet, connection),
    getStakebotStake(wallet, connection)
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
  const uiStatus = !binding.hasBinding
    ? "no_binding"
    : vsolUi < 1
      ? "low_balance"
      : stakebot.found
        ? "ready"
        : "updating";

  return {
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
      sourceFile: stakebot.sourceFile,
      sourceUrl: stakebot.sourceUrl
    },
    uiStatus
  };
}

export function getVaultManage(
  network: string,
  wallet: string,
  forceRefresh = false
): Promise<VaultManageResponse> {
  return getWalletData({
    resource: "vault-manage",
    network,
    wallet,
    forceRefresh,
    policy: (data) =>
      data.uiStatus === "updating"
        ? WALLET_CACHE_POLICIES.vaultUpdating
        : WALLET_CACHE_POLICIES.vault,
    fetcher: () => fetchVaultManage(network, wallet)
  });
}
