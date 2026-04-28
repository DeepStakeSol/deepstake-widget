// Centralized API helpers for backend endpoints
import { GetStakeAccountResponse } from "./solana/stake/get-stake-accounts";
import { Base64EncodedWireTransaction } from "@solana/kit";
import {
  getCachedStakeAccounts,
  setCachedStakeAccounts,
} from "./stakeAccountsCache";

const apiBaseURL = import.meta.env.VITE_BACKEND_URL;

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${apiBaseURL}${path}`);
  if (!res.ok) {
    throw new Error(`HTTP error ${res.status} when fetching ${path}`);
  }
  return (await res.json()) as T;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${apiBaseURL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`HTTP error ${res.status} when posting ${path}`);
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
    `/api/stake/fetch?owner=${owner}&network=${network}`
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
    `/api/stake/get-epoch-info?network=${network}`
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
    `/api/stake/get-perf-samples?network=${network}`
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
    `/api/stake/generate?network=${network}`,
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
    `/api/unstake/generate?network=${network}`,
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
    `/api/withdraw/generate?network=${network}`,
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
  };
  uiStatus: "ready" | "updating" | "low_balance" | "no_binding" | "error";
  message?: string;
}

export async function fetchVaultManage(
  wallet: string,
  network: string
): Promise<VaultManageResponse> {
  return getJson<VaultManageResponse>(
    `/api/blaze/manage/vault?wallet=${wallet}&network=${network}`
  );
}

// SOL balance
export async function fetchSolBalance(
  walletAddress: string,
  network: string
): Promise<number> {
  const data = await getJson<{ solBalance: number }>(
    `/api/balance?address=${walletAddress}&network=${network}`
  );
  return data.solBalance;
}

// LST token balance (bSOL, vSOL, etc.)
export async function fetchLSTBalance(
  walletAddress: string,
  network: string,
  mint: string
): Promise<number> {
  const data = await getJson<{ lst: string }>(
    `/api/vbalance?address=${walletAddress}&network=${network}&mint=${mint}`
  );
  return Number(data.lst) / 1e9;
}

// Blaze stake transaction builder
export interface GenerateBlazeStakeTxParams {
  wallet: string;
  stakeLamports: number;
  voteIdentity?: string;
}

export async function generateBlazeStakeTransaction(
  network: string,
  params: GenerateBlazeStakeTxParams
): Promise<string> {
  const data = await postJson<{ transaction: string }>(
    `/api/blaze/stake/generate?network=${network}`,
    params
  );
  return data.transaction;
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
    `/api/transaction/confirm?network=${network}`,
    options
  );
  if (data.error) {
    throw new Error(data.error);
  }
}
