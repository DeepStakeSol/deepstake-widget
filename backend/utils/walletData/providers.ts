import {
  address,
  getAddressDecoder,
  getU64Decoder,
  type Rpc,
  type SolanaRpcApi
} from "@solana/kit";
import {
  findAssociatedTokenPda,
  TOKEN_PROGRAM_ADDRESS
} from "@solana-program/token";

import { getJpoolStakePoolAddress, JSOL_MINT, VSOL_MINT } from "../consts";
import {
  fetchJpoolDirectStakes,
  fetchJpoolWalletBinding,
  type JpoolDirectStakeRecord,
  type JpoolWalletBinding
} from "../jpool/api";
import {
  decodeBase64AccountData,
  fetchJpoolStakePool
} from "../solana/jpool/pool";
import { createRpcConnection } from "../solana/rpc";
import {
  getStakeAccounts,
  type GetStakeAccountResponse
} from "../solana/stake/get-stake-accounts";
import { getStakebotStake } from "../stakebot";
import { getVaultBinding } from "../vaultBinding";
import {
  getWalletData,
  WALLET_CACHE_POLICIES,
  type WalletPolicyContext
} from "./service";

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

export type JpoolSourceStatus = "ok" | "unavailable";

export type JpoolManageUiStatus =
  | "not_bound"
  | "bound_here"
  | "bound_elsewhere"
  | "error";

// All amounts are decimal strings in base units (lamports / JSOL 1e-9).
export interface JpoolManageResponse {
  wallet: string;
  network: string;
  voteAccount: string;
  // JSOL in the wallet's associated token account; "0" when the ATA does not
  // exist, null when it could not be read.
  walletAtaBalance: string | null;
  // null when the RPC read failed: the frontend must not assume either way.
  ataExists: boolean | null;
  // TEMP(JPOOL-TMP-07): JSOL held in DeFi (api.hc.jpool.one) is not fetched.
  portfolioBalance: null;
  poolRate: { totalLamports: string; poolTokenSupply: string } | null;
  binding: { voteId: string; amount: string | null; updatedAt: string | null } | null;
  // null when JPool /find is unavailable (unlike [] = no records).
  directStakes: Array<{
    id: string | null;
    voteId: string;
    poolTokenAmount: string | null;
    balanceAmount: string | null;
    availableAmount: string;
    createdAt: string | null;
  }> | null;
  // Direct records for this vote plus the binding amount when bound here;
  // null when either input is unknown.
  countedForValidator: string | null;
  // TEMP(JPOOL-TMP-16): per-source ok/unavailable only; no last-known-good
  // values or observedAt timestamps.
  sources: {
    wallet: JpoolSourceStatus;
    pool: JpoolSourceStatus;
    binding: JpoolSourceStatus;
    directStakes: JpoolSourceStatus;
  };
  uiStatus: JpoolManageUiStatus;
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
  const rpc = createRpcConnection(network);
  const walletAddress = address(wallet);
  const [binding, stakebot] = await Promise.all([
    getVaultBinding(wallet, rpc),
    getStakebotStake(wallet, rpc)
  ]);
  const [lstAta] = await findAssociatedTokenPda({
    owner: walletAddress,
    mint: address(VSOL_MINT),
    tokenProgram: TOKEN_PROGRAM_ADDRESS
  });

  let vsolRaw = "0";
  try {
    const result = await rpc.getTokenAccountBalance(lstAta).send();
    vsolRaw = result.value.amount;
  } catch {
    vsolRaw = "0";
  }
  const vsolUi = Number(vsolRaw) / 1e9;
  const uiStatus = !binding.hasBinding
    ? "no_binding"
    : stakebot.found
      ? "ready"
      : vsolUi >= 1
        ? "updating"
        : "low_balance";

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

type Settled<T> = { ok: true; value: T } | { ok: false };

async function settle<T>(
  label: string,
  promise: () => Promise<T>
): Promise<Settled<T>> {
  try {
    return { ok: true, value: await promise() };
  } catch (error) {
    console.warn("JPool manage source unavailable", {
      source: label,
      error: error instanceof Error ? error.message : String(error)
    });
    return { ok: false };
  }
}

const TOKEN_ACCOUNT_AMOUNT_OFFSET = 64;

async function readJsolAta(
  rpc: Rpc<SolanaRpcApi>,
  wallet: string
): Promise<{ exists: boolean; amount: bigint }> {
  const owner = address(wallet);
  const mint = address(JSOL_MINT);
  const [ata] = await findAssociatedTokenPda({
    owner,
    mint,
    tokenProgram: TOKEN_PROGRAM_ADDRESS
  });
  const { value } = await rpc
    .getAccountInfo(ata, {
      commitment: "confirmed",
      encoding: "base64",
      dataSlice: { offset: 0, length: TOKEN_ACCOUNT_AMOUNT_OFFSET + 8 }
    })
    .send();
  if (!value) return { exists: false, amount: BigInt(0) };

  const data = decodeBase64AccountData(value.data);
  const addresses = getAddressDecoder();
  if (
    value.owner !== TOKEN_PROGRAM_ADDRESS ||
    data.length < TOKEN_ACCOUNT_AMOUNT_OFFSET + 8 ||
    addresses.decode(data.slice(0, 32)) !== mint ||
    addresses.decode(data.slice(32, 64)) !== owner
  ) {
    throw new Error("Unexpected JSOL associated token account");
  }
  return {
    exists: true,
    amount: getU64Decoder().decode(data, TOKEN_ACCOUNT_AMOUNT_OFFSET)
  };
}

function jpoolUiStatus(
  binding: Settled<JpoolWalletBinding | null>,
  voteAccount: string
): JpoolManageUiStatus {
  if (!binding.ok) return "error";
  if (binding.value === null) return "not_bound";
  return binding.value.voteId === voteAccount ? "bound_here" : "bound_elsewhere";
}

function countedForValidator(
  binding: Settled<JpoolWalletBinding | null>,
  directStakes: Settled<JpoolDirectStakeRecord[]>,
  voteAccount: string
): bigint | null {
  if (!binding.ok || !directStakes.ok) return null;
  let total = directStakes.value.reduce(
    (sum, record) => sum + record.availableAmount,
    BigInt(0)
  );
  if (binding.value?.voteId === voteAccount) {
    if (binding.value.amount === null) return null;
    total += binding.value.amount;
  }
  return total;
}

// Never throws for upstream failures: each source degrades on its own and is
// reported in `sources`.
export async function fetchJpoolManage(
  network: string,
  wallet: string,
  voteAccount: string,
  fetchImpl: typeof fetch = fetch
): Promise<JpoolManageResponse> {
  const poolAddress = getJpoolStakePoolAddress(network);
  if (!poolAddress) throw new Error("JPool is available on mainnet only");

  const rpc = await settle("rpc", async () => createRpcConnection(network));
  const [ata, pool, binding, directStakes] = await Promise.all([
    settle("wallet", async () => {
      if (!rpc.ok) throw new Error("RPC unavailable");
      return readJsolAta(rpc.value, wallet);
    }),
    settle("pool", async () => {
      if (!rpc.ok) throw new Error("RPC unavailable");
      return fetchJpoolStakePool(rpc.value, address(poolAddress));
    }),
    settle("binding", () => fetchJpoolWalletBinding(wallet, fetchImpl)),
    settle("directStakes", () =>
      fetchJpoolDirectStakes(wallet, voteAccount, fetchImpl)
    )
  ]);
  const counted = countedForValidator(binding, directStakes, voteAccount);

  return {
    wallet,
    network,
    voteAccount,
    walletAtaBalance: ata.ok ? ata.value.amount.toString() : null,
    ataExists: ata.ok ? ata.value.exists : null,
    portfolioBalance: null,
    poolRate: pool.ok
      ? {
          totalLamports: pool.value.totalLamports.toString(),
          poolTokenSupply: pool.value.poolTokenSupply.toString()
        }
      : null,
    binding:
      binding.ok && binding.value
        ? {
            voteId: binding.value.voteId,
            amount: binding.value.amount?.toString() ?? null,
            updatedAt: binding.value.updatedAt
          }
        : null,
    directStakes: directStakes.ok
      ? directStakes.value.map((record) => ({
          id: record.id,
          voteId: record.voteId,
          poolTokenAmount: record.poolTokenAmount?.toString() ?? null,
          balanceAmount: record.balanceAmount?.toString() ?? null,
          availableAmount: record.availableAmount.toString(),
          createdAt: record.createdAt
        }))
      : null,
    countedForValidator: counted === null ? null : counted.toString(),
    sources: {
      wallet: ata.ok ? "ok" : "unavailable",
      pool: pool.ok ? "ok" : "unavailable",
      binding: binding.ok ? "ok" : "unavailable",
      directStakes: directStakes.ok ? "ok" : "unavailable"
    },
    uiStatus: jpoolUiStatus(binding, voteAccount)
  };
}

export function jpoolManagePolicy(
  data: JpoolManageResponse,
  { recentlyMutated }: WalletPolicyContext
) {
  const degraded = Object.values(data.sources).some(
    (status) => status !== "ok"
  );
  return recentlyMutated || degraded
    ? WALLET_CACHE_POLICIES.jpoolRecent
    : WALLET_CACHE_POLICIES.jpool;
}

export function getJpoolManage(
  network: string,
  wallet: string,
  voteAccount: string,
  forceRefresh = false
): Promise<JpoolManageResponse> {
  return getWalletData({
    resource: "jpool-manage",
    network,
    wallet,
    scope: voteAccount,
    forceRefresh,
    policy: jpoolManagePolicy,
    fetcher: () => fetchJpoolManage(network, wallet, voteAccount)
  });
}
