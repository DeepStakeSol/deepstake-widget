import { getBackendUrl } from './backendUrl'

type BackendErrorPayload = {
  error?: unknown
  code?: unknown
  details?: unknown
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
      ? payload.error
      : 'The server could not complete the request'

  return new BackendRequestError(bodyMessage, {
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
