// Centralized API helpers for backend endpoints
import { GetStakeAccountResponse } from "./solana/stake/get-stake-accounts";
import { Base64EncodedWireTransaction } from "@solana/kit";
import {
  getCachedStakeAccounts,
  setCachedStakeAccounts,
} from "./stakeAccountsCache";
import { getBackendUrl } from "./backendUrl";
import { cachedRequest, invalidateRequestCacheByPrefix } from "./requestCache";

const SHORT_WALLET_CACHE_TTL_MS = 30_000;
const MANAGE_CACHE_TTL_MS = 60_000;

async function getJson<T>(path: string): Promise<T> {
  const url = getBackendUrl(path);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP error ${res.status} when fetching ${url}`);
  }
  return (await res.json()) as T;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const url = getBackendUrl(path);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`HTTP error ${res.status} when posting ${url}`);
  }
  return (await res.json()) as T;
}

// stake accounts (cached with TTL)
export async function fetchStakeAccounts(
  owner: string,
  network: string
): Promise<GetStakeAccountResponse[]> {
  const cached = getCachedStakeAccounts(owner, network);
  if (cached !== null) return cached;

  const data = await getJson<{ stakeAccounts?: GetStakeAccountResponse[] }>(
    `/stake/fetch?owner=${owner}&network=${network}`
  );
  const accounts = data.stakeAccounts || [];
  setCachedStakeAccounts(owner, network, accounts);
  return accounts;
}

// epoch / perf information
export interface EpochInfo {
  epoch?: number;
  slotIndex?: number;
  slotsInEpoch?: number;
  [key: string]: any;
}

export interface EpochInfoResponse {
  epochInfo: EpochInfo;
}

export async function fetchEpochInfo(
  network: string
): Promise<EpochInfoResponse> {
  return await getJson<EpochInfoResponse>(
    `/stake/get-epoch-info?network=${network}`
  );
}

export interface PerfSample {
  numSlots: number;
  samplePeriodSecs: number;
  [key: string]: any;
}

export interface PerfSamplesResponse {
  sample: PerfSample;
}

export async function fetchPerfSamples(
  network: string
): Promise<PerfSamplesResponse> {
  return await getJson<PerfSamplesResponse>(
    `/stake/get-perf-samples?network=${network}`
  );
}

// transaction generation helpers
export interface GenerateStakeTxParams {
  newAccountAddress: string;
  stakeLamports: number;
  stakerAddress: string;
  voteAccount: string;
}

export async function generateStakeTransaction(
  network: string,
  params: GenerateStakeTxParams
): Promise<Base64EncodedWireTransaction> {
  const data = await postJson<{ wireTransaction: Base64EncodedWireTransaction }>(
    `/stake/generate?network=${network}`,
    params
  );
  return data.wireTransaction;
}

export interface GenerateUnstakeTxParams {
  stakerAddress: string;
  stakeAccountAddress: string;
}

export async function generateUnstakeTransaction(
  network: string,
  params: GenerateUnstakeTxParams
): Promise<Base64EncodedWireTransaction> {
  const data = await postJson<{ wireTransaction: Base64EncodedWireTransaction }>(
    `/unstake/generate?network=${network}`,
    params
  );
  return data.wireTransaction;
}

export interface GenerateWithdrawTxParams {
  stakeAccountAddress: string;
  recipientAccountAddress: string;
}

export async function generateWithdrawTransaction(
  network: string,
  params: GenerateWithdrawTxParams
): Promise<Base64EncodedWireTransaction> {
  const data = await postJson<{ wireTransaction: Base64EncodedWireTransaction }>(
    `/withdraw/generate?network=${network}`,
    params
  );
  return data.wireTransaction;
}

// vault manage
export interface VaultManageResponse {
  wallet: string;
  binding: {
    hasBinding: boolean;
    validatorVoteKey?: string;
  };
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

export async function fetchVaultManage(
  wallet: string,
  network: string
): Promise<VaultManageResponse> {
  return cachedRequest(
    `vaultManage:${network}:${wallet}`,
    MANAGE_CACHE_TTL_MS,
    () => getJson<VaultManageResponse>(
      `/blaze/manage/vault?wallet=${wallet}&network=${network}`
    )
  );
}

// SOL balance
export async function fetchSolBalance(
  walletAddress: string,
  network: string
): Promise<number> {
  return cachedRequest(
    `solBalance:${network}:${walletAddress}`,
    SHORT_WALLET_CACHE_TTL_MS,
    async () => {
      const data = await getJson<{ solBalance: number }>(
        `/balance?address=${walletAddress}&network=${network}`
      );
      return data.solBalance;
    }
  );
}

// LST token balance (bSOL, vSOL, etc.)
export async function fetchLSTBalance(
  walletAddress: string,
  network: string,
  mint: string
): Promise<number> {
  return cachedRequest(
    `lstBalance:${network}:${walletAddress}:${mint}`,
    SHORT_WALLET_CACHE_TTL_MS,
    async () => {
      const data = await getJson<{ lst: string }>(
        `/vbalance?address=${walletAddress}&network=${network}&mint=${mint}`
      );
      return Number(data.lst) / 1e9;
    }
  );
}


export interface BlazeAppliedStake {
  voteAcc: string;
  amount: number;
}

export async function fetchBlazeAppliedStakes(
  walletAddress: string,
  network: string
): Promise<BlazeAppliedStake[]> {
  return cachedRequest(
    `blazeAppliedStakes:${network}:${walletAddress}`,
    MANAGE_CACHE_TTL_MS,
    async () => {
      const response = await fetch(
        `https://stake.solblaze.org/api/v1/cls_applied_user_stake?address=${walletAddress}`
      );
      const data = await response.json();

      if (!data.success || !data.applied_stakes) {
        return [];
      }

      return Object.entries(data.applied_stakes).map(([voteAcc, amount]) => ({
        voteAcc,
        amount: amount as number,
      }));
    }
  );
}

export function invalidateWalletReadCaches(walletAddress: string, network: string): void {
  invalidateRequestCacheByPrefix(`solBalance:${network}:${walletAddress}`);
  invalidateRequestCacheByPrefix(`lstBalance:${network}:${walletAddress}:`);
  invalidateRequestCacheByPrefix(`vaultManage:${network}:${walletAddress}`);
  invalidateRequestCacheByPrefix(`blazeAppliedStakes:${network}:${walletAddress}`);
}

export function invalidateSolBalanceCache(walletAddress: string, network: string): void {
  invalidateRequestCacheByPrefix(`solBalance:${network}:${walletAddress}`);
}

export function invalidateLSTBalanceCache(
  walletAddress: string,
  network: string,
  mint: string
): void {
  invalidateRequestCacheByPrefix(`lstBalance:${network}:${walletAddress}:${mint}`);
}

export function invalidateVaultManageCache(walletAddress: string, network: string): void {
  invalidateRequestCacheByPrefix(`vaultManage:${network}:${walletAddress}`);
}

export function invalidateBlazeAppliedStakesCache(walletAddress: string, network: string): void {
  invalidateRequestCacheByPrefix(`blazeAppliedStakes:${network}:${walletAddress}`);
}

// Blaze stake transaction builder
export interface GenerateBlazeStakeTxParams {
  wallet: string;
  stakeLamports: number;
  voteIdentity?: string;
}

export interface GenerateBlazeStakeTxResponse {
  transaction: string;
  ephemeralKey: string;
}

export async function generateBlazeStakeTransaction(
  network: string,
  params: GenerateBlazeStakeTxParams
): Promise<GenerateBlazeStakeTxResponse> {
  return postJson<GenerateBlazeStakeTxResponse>(
    `/blaze/stake/generate?network=${network}`,
    params
  );
}

// confirmation helper
export interface ConfirmTxOptions {
  txid: string;
  targetCommitment?: string;
  timeout?: number;
  interval?: number;
}

export async function confirmTransaction(
  network: string,
  options: ConfirmTxOptions
): Promise<void> {
  const data = await postJson<{ error?: string }>(
    `/transaction/confirm?network=${network}`,
    options
  );
  if (data.error) {
    throw new Error(data.error);
  }
}
