import { getBackendUrl } from './backendUrl'

type BackendErrorPayload = {
  error?: unknown
  code?: unknown
  details?: unknown
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export function formatLamportsAsSol(lamports: number): string {
  if (!Number.isSafeInteger(lamports) || lamports < 0) {
    return String(lamports / 1_000_000_000)
  }

  const whole = Math.floor(lamports / 1_000_000_000)
  const fraction = String(lamports % 1_000_000_000)
    .padStart(9, '0')
    .replace(/0+$/, '')
  return fraction ? whole + '.' + fraction : String(whole)
}

function formatMinimumDetails(details: unknown): string | null {
  const value = asRecord(details)
  if (!value || typeof value.network !== 'string') return null

  if (
    typeof value.minimumStakeLamports === 'number' &&
    Number.isFinite(value.minimumStakeLamports)
  ) {
    return (
      'Minimum stake on ' +
      value.network +
      ' is ' +
      formatLamportsAsSol(value.minimumStakeLamports) +
      ' SOL'
    )
  }

  if (
    typeof value.minimumStakeSol === 'number' &&
    Number.isFinite(value.minimumStakeSol)
  ) {
    return (
      'Minimum stake on ' +
      value.network +
      ' is ' +
      String(value.minimumStakeSol) +
      ' SOL'
    )
  }

  return null
}

export class BackendRequestError extends Error {
  readonly status: number
  readonly code?: string
  readonly details?: unknown

  constructor(
    message: string,
    options: { status: number; code?: string; details?: unknown },
  ) {
    super(message)
    this.name = 'BackendRequestError'
    this.status = options.status
    this.code = options.code
    this.details = options.details
  }
}

async function backendError(response: Response): Promise<BackendRequestError> {
  let payload: BackendErrorPayload | null = null
  try {
    payload = (await response.json()) as BackendErrorPayload
  } catch {
    // Some infrastructure errors return HTML or an empty body.
  }

  const bodyMessage =
    typeof payload?.error === 'string' && payload.error.trim()
      ? payload.error.trim()
      : 'The server could not complete the request'
  const minimumDetails = formatMinimumDetails(payload?.details)
  const message = minimumDetails
    ? bodyMessage.replace(/[.\s]+$/, '') + '. ' + minimumDetails + '.'
    : bodyMessage

  return new BackendRequestError(message, {
    status: response.status,
    code: typeof payload?.code === 'string' ? payload.code : undefined,
    details: payload?.details,
  })
}

export async function fetchBackendJson<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const url = getBackendUrl(path)
  const response = init ? await fetch(url, init) : await fetch(url)
  if (!response.ok) throw await backendError(response)
  return (await response.json()) as T
}
