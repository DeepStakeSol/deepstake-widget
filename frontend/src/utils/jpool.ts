// Typed clients for the JPool backend routes (J1-1..J1-4) and the UI text for
// their error codes (spec §8). Amounts stay decimal strings on the wire and
// become bigint only where arithmetic happens.
import type { UiWalletAccount } from '@wallet-standard/react'
import { address, isAddress, isOffCurveAddress } from '@solana/kit'
import { BackendRequestError, fetchBackendJson } from './backendRequest'
import { quoteDepositSol } from './jpoolQuote'
import { cachedRequest, deduplicatedRequest } from './requestCache'

export const JPOOL_ELIGIBILITY_TIMEOUT_MS = 2_000
// The backend caches the pool for 5 minutes; the browser only avoids refetching
// on every keystroke and tab switch.
const JPOOL_POOL_CACHE_TTL_MS = 60_000

function query(params: Record<string, string>): string {
  return new URLSearchParams(params).toString()
}

// POST /jpool/stake/generate
export interface GenerateJpoolStakeTxParams {
  wallet: string
  voteAccount: string
  stakeLamports: bigint
}

export interface GenerateJpoolStakeTxResponse {
  // base64 unsigned legacy transaction; the wallet is the only signer
  transaction: string
  // JSOL base units, fee-aware, computed on the same pool snapshot
  quote: { expectedJsol: string }
}

export async function generateJpoolStakeTransaction(
  network: string,
  { wallet, voteAccount, stakeLamports }: GenerateJpoolStakeTxParams
): Promise<GenerateJpoolStakeTxResponse> {
  return fetchBackendJson<GenerateJpoolStakeTxResponse>(
    `/jpool/stake/generate?${query({ network })}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet, voteAccount, stakeLamports: stakeLamports.toString() }),
    }
  )
}

// GET /jpool/pool
export interface JpoolPoolResponse {
  network: string
  poolAddress: string
  totalLamports: string
  poolTokenSupply: string
  lastUpdateEpoch: string
  solDepositFee: { denominator: string; numerator: string }
  depositsRestricted: boolean
  // Live rent for the JSOL ATA. Null when the backend could not read it;
  // absent in responses cached before the field existed.
  ataRentLamports?: string | null
}

// Live ATA rent from the pool response, or null to fall back to the constant.
export function jpoolAtaRentLamports(pool: JpoolPoolResponse | null): bigint | null {
  const rent = pool?.ataRentLamports
  return typeof rent === 'string' && /^\d+$/.test(rent) ? BigInt(rent) : null
}

export async function fetchJpoolPool(network: string): Promise<JpoolPoolResponse> {
  return cachedRequest(`jpoolPool:${network}`, JPOOL_POOL_CACHE_TTL_MS, () =>
    fetchBackendJson<JpoolPoolResponse>(`/jpool/pool?${query({ network })}`)
  )
}

// Pre-submit "~X JSOL" estimate. Null when the amount or pool state gives no
// meaningful quote (the program would reject the deposit).
export function quoteJsolForPool(pool: JpoolPoolResponse, lamports: bigint): bigint | null {
  try {
    return quoteDepositSol({
      lamports,
      totalLamports: BigInt(pool.totalLamports),
      poolTokenSupply: BigInt(pool.poolTokenSupply),
      solDepositFee: {
        denominator: BigInt(pool.solDepositFee.denominator),
        numerator: BigInt(pool.solDepositFee.numerator),
      },
    })
  } catch {
    return null
  }
}

// GET /jpool/manage
export type JpoolSourceStatus = 'ok' | 'unavailable'
export type JpoolManageUiStatus = 'not_bound' | 'bound_here' | 'bound_elsewhere' | 'error'

export interface JpoolDirectStake {
  id: string | null
  voteId: string
  poolTokenAmount: string | null
  balanceAmount: string | null
  availableAmount: string
  createdAt: string | null
}

// Mirrors backend `JpoolManageResponse`; all amounts are base-unit strings.
export interface JpoolManageResponse {
  wallet: string
  network: string
  voteAccount: string
  walletAtaBalance: string | null
  // null = unknown (RPC failed): never treat as missing
  ataExists: boolean | null
  portfolioBalance: null
  poolRate: { totalLamports: string; poolTokenSupply: string } | null
  binding: { voteId: string; amount: string | null; updatedAt: string | null } | null
  // null = JPool /find unavailable; [] = no records
  directStakes: JpoolDirectStake[] | null
  countedForValidator: string | null
  sources: {
    wallet: JpoolSourceStatus
    pool: JpoolSourceStatus
    binding: JpoolSourceStatus
    directStakes: JpoolSourceStatus
  }
  uiStatus: JpoolManageUiStatus
}

export async function fetchJpoolManage(
  wallet: string,
  voteAccount: string,
  network: string,
  options: { refresh?: boolean } = {}
): Promise<JpoolManageResponse> {
  const refresh = options.refresh === true
  return deduplicatedRequest(`jpoolManage:${network}:${wallet}:${voteAccount}:${refresh}`, () =>
    fetchBackendJson<JpoolManageResponse>(
      `/jpool/manage?${query({
        wallet,
        vote: voteAccount,
        network,
        ...(refresh ? { refresh: 'true' } : {}),
      })}`
    )
  )
}

// GET /jpool/eligibility
export type JpoolEligibilityReason = 'blocked' | 'superminority' | 'not_member'

export interface JpoolEligibility {
  eligible: boolean
  reason: JpoolEligibilityReason | null
  epoch: number | null
  source: 'jpool' | 'fallback'
  // Set only when this client failed open; absent for backend verdicts.
  clientFallback?: 'timeout' | 'error'
}

function clientFallback(cause: 'timeout' | 'error'): JpoolEligibility {
  return { eligible: true, reason: null, epoch: null, source: 'fallback', clientFallback: cause }
}

function isEligibility(value: unknown): value is JpoolEligibility {
  const body = value as Partial<JpoolEligibility> | null
  return (
    typeof body?.eligible === 'boolean' && (body.source === 'jpool' || body.source === 'fallback')
  )
}

// Always resolves (fail open) unless the caller aborts through `signal`, in
// which case it rejects with the abort reason so a late result can be dropped.
export async function fetchJpoolEligibility(
  voteAccount: string,
  network: string,
  options: { signal?: AbortSignal; timeoutMs?: number } = {}
): Promise<JpoolEligibility> {
  const { signal, timeoutMs = JPOOL_ELIGIBILITY_TIMEOUT_MS } = options
  signal?.throwIfAborted()

  const controller = new AbortController()
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const onAbort = () => controller.abort(signal?.reason)
  signal?.addEventListener('abort', onAbort, { once: true })

  try {
    const body = await fetchBackendJson<unknown>(
      `/jpool/eligibility?${query({ vote: voteAccount, network })}`,
      { signal: controller.signal }
    )
    return isEligibility(body) ? body : clientFallback('error')
  } catch {
    if (signal?.aborted) throw signal.reason
    return clientFallback(timedOut ? 'timeout' : 'error')
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', onAbort)
  }
}

// Error codes from generate, send and confirm -> UI text (spec §8).
const JPOOL_ERROR_TEXT: Record<string, string> = {
  JPOOL_POOL_UPDATING: 'JPool is updating for the new epoch. Please try again in a few minutes.',
  JPOOL_DEPOSITS_RESTRICTED: 'Deposits to JPool are paused right now. Please try again later.',
  JPOOL_DEPOSIT_TOO_SMALL: 'The amount is too small to deposit into JPool.',
  JPOOL_INSUFFICIENT_FUNDS: 'Insufficient SOL balance to cover this deposit and network fees.',
  TRANSACTION_INSUFFICIENT_FUNDS:
    'Insufficient SOL balance to cover this deposit and network fees.',
  JPOOL_MAINNET_ONLY: 'JPool is available on mainnet only.',
  JPOOL_RPC_UNAVAILABLE: 'The Solana network is temporarily unavailable. Please try again later.',
  RPC_UNAVAILABLE: 'The Solana network is temporarily unavailable. Please try again later.',
  TRANSACTION_EXPIRED: 'The transaction expired before it was sent. Please try again.',
  TRANSACTION_SIGNATURE_INVALID: 'The wallet signature could not be verified. Please try again.',
  TRANSACTION_NOT_SIGNED: 'The wallet did not sign the transaction. Please try again.',
  // The bytes may still land: J1-6 confirms the returned signature first.
  TRANSACTION_SEND_FAILED:
    'The transaction could not be confirmed as sent. Check your wallet activity before trying again.',
  JPOOL_SIMULATION_FAILED: 'The JPool deposit could not be simulated. Please try again later.',
  TRANSACTION_SIMULATION_FAILED:
    'The JPool deposit could not be simulated. Please try again later.',
  JPOOL_POOL_INVALID: 'JPool is temporarily unavailable. Please try again later.',
}

export const JPOOL_DEPOSIT_FAILED_TEXT = 'The JPool deposit failed. Please try again.'

export const JPOOL_DATA_UNAVAILABLE_TEXT =
  'JPool data is temporarily unavailable. Your balance is shown; binding details will appear when JPool is back.'

export function getJpoolErrorText(error: unknown): string {
  const code = error instanceof BackendRequestError ? error.code : undefined
  return (code && JPOOL_ERROR_TEXT[code]) || JPOOL_DEPOSIT_FAILED_TEXT
}

// Post-deposit registration check, measured from confirmation. JPool's indexer
// runs on 5-minute marks (J1 mainnet gate: records created 2.5 and 3 min after
// the block), so the last poll lands just past one full cycle.
export const JPOOL_REGISTRATION_POLL_DELAYS_MS = [15_000, 60_000, 180_000, 330_000] as const

function directStakeKey(record: JpoolDirectStake): string {
  return record.id ?? `${record.createdAt}:${record.poolTokenAmount}:${record.availableAmount}`
}

// Null when the records are unknown (JPool /find unavailable).
export function directStakeKeys(manage: JpoolManageResponse | null): Set<string> | null {
  return manage?.directStakes ? new Set(manage.directStakes.map(directStakeKey)) : null
}

export function hasNewDirectStake(before: Set<string>, manage: JpoolManageResponse): boolean {
  return (manage.directStakes ?? []).some((record) => !before.has(directStakeKey(record)))
}

export const JPOOL_APP_URL = 'https://app.jpool.one'

export function jpoolDirectStakeUrl(voteAccount: string): string {
  return `${JPOOL_APP_URL}/validators/${voteAccount}/direct`
}

// Wallet binding (J2-2). JPool verifies an Ed25519 signature by the wallet key
// over the exact message bytes, so the account must sign messages and be a
// real key (not a PDA).
export type JpoolBindCapability = 'supported' | 'no_sign_message' | 'off_curve'

export const SOLANA_SIGN_MESSAGE_FEATURE = 'solana:signMessage'

export function getJpoolBindCapability(
  account: Pick<UiWalletAccount, 'address' | 'features'>
): JpoolBindCapability {
  if (!account.features.includes(SOLANA_SIGN_MESSAGE_FEATURE)) return 'no_sign_message'
  if (!isAddress(account.address) || isOffCurveAddress(address(account.address))) {
    return 'off_curve'
  }
  return 'supported'
}

// The exact string the wallet signs and the backend receives. Compact JSON in
// this key order; the backend refuses any other spelling.
export function buildJpoolBindMessage(
  wallet: string,
  voteId: string,
  now: number = Date.now()
): string {
  return JSON.stringify({ wallet, action: 'bindWallet', voteId, timestamp: now })
}

// POST /jpool/bind
export interface JpoolBindRequest {
  wallet: string
  // base64 of the 64-byte Ed25519 signature
  signature: string
  message: string
}

export interface JpoolBindResponse {
  success: true
  alreadyBound: boolean
  voteId: string
}

// Not deduplicated: each call is a new signed attempt. Errors are
// BackendRequestError; JPOOL_BOUND_ELSEWHERE carries `boundTo` and
// JPOOL_RATE_LIMITED `retryAfterSeconds` in `error.body`.
export async function bindJpoolWallet(
  network: string,
  request: JpoolBindRequest
): Promise<JpoolBindResponse> {
  return fetchBackendJson<JpoolBindResponse>(`/jpool/bind?${query({ network })}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
}

export function jpoolBoundToVoteId(error: unknown): string | null {
  if (!(error instanceof BackendRequestError)) return null
  const boundTo = error.body?.boundTo as { voteId?: unknown } | undefined
  return typeof boundTo?.voteId === 'string' ? boundTo.voteId : null
}

export function jpoolRetryAfterSeconds(error: unknown): number | null {
  if (!(error instanceof BackendRequestError)) return null
  const value = error.body?.retryAfterSeconds
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

export const JPOOL_BIND_LATER_TEXT = 'You can bind your wallet later on the Manage tab.'

const JPOOL_BIND_EXPIRED_TEXT =
  'The signed message expired. Please try again and check your device clock.'
const JPOOL_BIND_UNAVAILABLE_TEXT = `JPool is temporarily unavailable. ${JPOOL_BIND_LATER_TEXT}`
const JPOOL_BIND_REJECTED_TEXT = `JPool did not accept the binding. ${JPOOL_BIND_LATER_TEXT}`

// Bind error codes (backend J2-1 and the hook's own) -> UI text (spec §8).
const JPOOL_BIND_ERROR_TEXT: Record<string, string> = {
  JPOOL_BIND_EXPIRED: JPOOL_BIND_EXPIRED_TEXT,
  INVALID_BIND_MESSAGE: JPOOL_BIND_EXPIRED_TEXT,
  JPOOL_UNAVAILABLE: JPOOL_BIND_UNAVAILABLE_TEXT,
  JPOOL_BIND_UNAVAILABLE: JPOOL_BIND_UNAVAILABLE_TEXT,
  JPOOL_BIND_REJECTED: JPOOL_BIND_REJECTED_TEXT,
  INVALID_SIGNATURE: JPOOL_BIND_REJECTED_TEXT,
}

export function getJpoolBindErrorText(code: string | undefined, retryAfterSeconds?: number | null) {
  if (code === 'JPOOL_RATE_LIMITED') {
    return retryAfterSeconds
      ? `Too many attempts. Please try again in ${retryAfterSeconds} seconds.`
      : 'Too many attempts. Please try again in a minute.'
  }
  return (code && JPOOL_BIND_ERROR_TEXT[code]) || JPOOL_BIND_LATER_TEXT
}
