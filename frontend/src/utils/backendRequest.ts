import { getBackendUrl } from './backendUrl'

type BackendErrorPayload = {
  error?: unknown
  code?: unknown
  details?: unknown
  signature?: unknown
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

export class BackendRequestError extends Error {
  readonly status: number
  readonly code?: string
  readonly details?: unknown
  // Set by /transaction/send on TRANSACTION_SEND_FAILED: the bytes may still
  // have landed, so the caller confirms this signature before retrying.
  readonly signature?: string
  // The parsed JSON error body, for route-specific fields such as /jpool/bind's
  // `boundTo` and `retryAfterSeconds`. Undefined when the body was not an object.
  readonly body?: Record<string, unknown>

  constructor(
    message: string,
    options: {
      status: number
      code?: string
      details?: unknown
      signature?: string
      body?: Record<string, unknown>
    },
  ) {
    super(message)
    this.name = 'BackendRequestError'
    this.status = options.status
    this.code = options.code
    this.details = options.details
    this.signature = options.signature
    this.body = options.body
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
      ? payload.error
      : 'The server could not complete the request'

  return new BackendRequestError(bodyMessage, {
    status: response.status,
    code: typeof payload?.code === 'string' ? payload.code : undefined,
    details: payload?.details,
    signature: typeof payload?.signature === 'string' ? payload.signature : undefined,
    body:
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : undefined,
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
