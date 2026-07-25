// Centralized API helpers for backend endpoints
import { GetStakeAccountResponse } from './solana/stake/get-stake-accounts'
import { Base64EncodedWireTransaction } from '@solana/kit'
import { getBackendUrl } from './backendUrl'
import { cachedRequest, deduplicatedRequest, invalidateRequestCacheByPrefix } from './requestCache'

const SHORT_WALLET_CACHE_TTL_MS = 30_000

async function getJson<T>(path: string): Promise<T> {
  const url = getBackendUrl(path)
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`HTTP error ${res.status} when fetching ${url}`)
  }
  return (await res.json()) as T
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const url = getBackendUrl(path)
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(`HTTP error ${res.status} when posting ${url}`)
  }
  return (await res.json()) as T
}

// stake accounts (Redis-cached by the backend; in-flight only in the browser)
export async function fetchStakeAccounts(
  owner: string,
  network: string,
  options: { refresh?: boolean } = {}
): Promise<GetStakeAccountResponse[]> {
  const refresh = options.refresh === true
  return deduplicatedRequest(`stakeAccounts:${network}:${owner}:${refresh}`, async () => {
    const data = await getJson<{ stakeAccounts?: GetStakeAccountResponse[] }>(
      `/stake/fetch?owner=${encodeURIComponent(owner)}&network=${encodeURIComponent(network)}${refresh ? '&refresh=true' : ''}`
    )
    return data.stakeAccounts || []
  })
}

// epoch / perf information
export interface EpochInfo {
  epoch?: number
  slotIndex?: number
  slotsInEpoch?: number
  [key: string]: unknown
}

export interface EpochInfoResponse {
  epochInfo: EpochInfo
}

export async function fetchEpochInfo(network: string): Promise<EpochInfoResponse> {
  return await getJson<EpochInfoResponse>(`/stake/get-epoch-info?network=${network}`)
}

export interface PerfSample {
  numSlots: number
  samplePeriodSecs: number
  [key: string]: unknown
}

export interface PerfSamplesResponse {
  sample: PerfSample
}

export async function fetchPerfSamples(network: string): Promise<PerfSamplesResponse> {
  return await getJson<PerfSamplesResponse>(`/stake/get-perf-samples?network=${network}`)
}

// transaction generation helpers
export interface GenerateStakeTxParams {
  newAccountAddress: string
  stakeLamports: number
  stakerAddress: string
  voteAccount: string
}

export async function generateStakeTransaction(
  network: string,
  params: GenerateStakeTxParams
): Promise<Base64EncodedWireTransaction> {
  const data = await postJson<{ wireTransaction: Base64EncodedWireTransaction }>(
    `/stake/generate?network=${network}`,
    params
  )
  return data.wireTransaction
}

export interface GenerateUnstakeTxParams {
  stakerAddress: string
  stakeAccountAddress: string
}

export async function generateUnstakeTransaction(
  network: string,
  params: GenerateUnstakeTxParams
): Promise<Base64EncodedWireTransaction> {
  const data = await postJson<{ wireTransaction: Base64EncodedWireTransaction }>(
    `/unstake/generate?network=${network}`,
    params
  )
  return data.wireTransaction
}

export interface GenerateWithdrawTxParams {
  stakeAccountAddress: string
  recipientAccountAddress: string
}

export async function generateWithdrawTransaction(
  network: string,
  params: GenerateWithdrawTxParams
): Promise<Base64EncodedWireTransaction> {
  const data = await postJson<{ wireTransaction: Base64EncodedWireTransaction }>(
    `/withdraw/generate?network=${network}`,
    params
  )
  return data.wireTransaction
}

// vault manage
export interface VaultManageResponse {
  wallet: string
  binding: {
    hasBinding: boolean
    validatorVoteKey?: string
  }
  balance: { vsol: string }
  stakebot: {
    found: boolean
    generatedStake?: string
    epoch?: number
    sourceFile?: string
    sourceUrl?: string
  }
  uiStatus: 'ready' | 'updating' | 'low_balance' | 'no_binding' | 'error'
  message?: string
}

export async function fetchVaultManage(
  wallet: string,
  network: string,
  options: { refresh?: boolean } = {}
): Promise<VaultManageResponse> {
  const refresh = options.refresh === true
  return deduplicatedRequest(`vaultManage:${network}:${wallet}:${refresh}`, () =>
    getJson<VaultManageResponse>(
      `/blaze/manage/vault?wallet=${encodeURIComponent(wallet)}&network=${encodeURIComponent(network)}${refresh ? '&refresh=true' : ''}`
    )
  )
}

// SOL balance
export async function fetchSolBalance(walletAddress: string, network: string): Promise<number> {
  return cachedRequest(
    `solBalance:${network}:${walletAddress}`,
    SHORT_WALLET_CACHE_TTL_MS,
    async () => {
      const data = await getJson<{ solBalance: number }>(
        `/balance?address=${walletAddress}&network=${network}`
      )
      return data.solBalance
    }
  )
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
      )
      return Number(data.lst) / 1e9
    }
  )
}

export interface BlazeAppliedStake {
  voteAcc: string
  amount: number
}

export async function fetchBlazeAppliedStakes(
  walletAddress: string,
  network: string,
  options: { refresh?: boolean } = {}
): Promise<BlazeAppliedStake[]> {
  const refresh = options.refresh === true
  return deduplicatedRequest(
    `blazeAppliedStakes:${network}:${walletAddress}:${refresh}`,
    async () => {
      const data = await getJson<{ appliedStakes?: BlazeAppliedStake[] }>(
        `/blaze/manage/applied-stakes?wallet=${encodeURIComponent(walletAddress)}&network=${encodeURIComponent(network)}${refresh ? '&refresh=true' : ''}`
      )
      return data.appliedStakes || []
    }
  )
}

export async function registerBlazeStake(
  network: string,
  params: { validator: string; txid: string; wallet: string }
): Promise<void> {
  await postJson<{ success: boolean }>(
    `/blaze/stake/register?network=${encodeURIComponent(network)}`,
    params
  )
}

export function invalidateWalletReadCaches(walletAddress: string, network: string): void {
  invalidateRequestCacheByPrefix(`solBalance:${network}:${walletAddress}`)
  invalidateRequestCacheByPrefix(`lstBalance:${network}:${walletAddress}:`)
}

export function invalidateSolBalanceCache(walletAddress: string, network: string): void {
  invalidateRequestCacheByPrefix(`solBalance:${network}:${walletAddress}`)
}

export function invalidateLSTBalanceCache(
  walletAddress: string,
  network: string,
  mint: string
): void {
  invalidateRequestCacheByPrefix(`lstBalance:${network}:${walletAddress}:${mint}`)
}

// Blaze stake transaction builder
export interface GenerateBlazeStakeTxParams {
  wallet: string
  stakeLamports: number
  voteIdentity?: string
}

export interface GenerateBlazeStakeTxResponse {
  transaction: string
  ephemeralKey: string
}

export async function generateBlazeStakeTransaction(
  network: string,
  params: GenerateBlazeStakeTxParams
): Promise<GenerateBlazeStakeTxResponse> {
  return postJson<GenerateBlazeStakeTxResponse>(`/blaze/stake/generate?network=${network}`, params)
}

// confirmation helper
export type WalletMutation =
  | 'native-stake'
  | 'native-unstake'
  | 'native-withdraw'
  | 'blaze-stake'
  | 'vault-stake'

export interface ConfirmTxOptions {
  txid: string
  targetCommitment?: string
  timeout?: number
  interval?: number
  cacheMutation?: { walletAddress: string; mutation: WalletMutation }
}

export async function confirmTransaction(
  network: string,
  options: ConfirmTxOptions
): Promise<void> {
  const data = await postJson<{ error?: string }>(
    `/transaction/confirm?network=${network}`,
    options
  )
  if (data.error) {
    throw new Error(data.error)
  }
}
