import { useCallback, useEffect, useRef, useState } from 'react'
import { useSignMessage } from '@solana/react'
import { getBase64Decoder } from '@solana/kit'
import type { UiWalletAccount } from '@wallet-standard/react'
import { BackendRequestError } from '../utils/backendRequest'
import {
  bindJpoolWallet,
  buildJpoolBindMessage,
  fetchJpoolManage,
  getJpoolBindCapability,
  getJpoolBindErrorText,
  jpoolBoundToVoteId,
  jpoolRetryAfterSeconds,
  type JpoolManageResponse,
} from '../utils/jpool'

export type JpoolBindStatus =
  | 'idle'
  | 'signing'
  | 'submitting'
  | 'success'
  | 'bound_elsewhere'
  // The user declined in the wallet: not an error, never retried automatically.
  | 'rejected'
  | 'error'

export type JpoolBindResult = { alreadyBound: boolean } | { boundTo: string }

export interface JpoolBindError {
  // A backend code, or the hook's own SIGN_FAILED / MESSAGE_MODIFIED /
  // INVALID_SIGNATURE / BIND_FAILED.
  code: string
  text: string
  retryAfterSeconds: number | null
}

export interface UseJpoolBindParams {
  // Must be a supported account (getJpoolBindCapability === 'supported'):
  // useSignMessage throws during render for an account without signMessage, so
  // callers pick between JpoolBindUnsupported and a child that calls this hook.
  account: UiWalletAccount
  voteAccount: string
  network: string
  onManageLoaded?: (manage: JpoolManageResponse) => void
}

interface KeyedState {
  key: string
  status: JpoolBindStatus
  result: JpoolBindResult | null
  error: JpoolBindError | null
}

const SIGNATURE_BYTES = 64

function idleState(key: string): KeyedState {
  return { key, status: 'idle', result: null, error: null }
}

function hookError(code: string, text?: string): JpoolBindError {
  return { code, text: text ?? getJpoolBindErrorText(code), retryAfterSeconds: null }
}

// Wallet Standard has no shared rejection error; Phantom, Solflare and
// Backpack use code 4001 and/or a "rejected" message.
export function isWalletRejection(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const { code, message } = error as { code?: unknown; message?: unknown }
  if (code === 4001) return true
  return typeof message === 'string' && /reject|denied|declin|cancel/i.test(message)
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false
  return true
}

// One bind attempt per click: sign the exact message bytes, POST the same
// string to /api/jpool/bind, then refresh Manage. Shared by the Manage Bind
// control (J2-3) and the post-deposit dialog (J2-4).
export function useJpoolBind({
  account,
  voteAccount,
  network,
  onManageLoaded,
}: UseJpoolBindParams) {
  if (import.meta.env.DEV && getJpoolBindCapability(account) !== 'supported') {
    console.error('useJpoolBind mounted for an account that cannot bind')
  }

  const signMessage = useSignMessage(account)
  const wallet = account.address
  const key = `${network}:${wallet}:${voteAccount}`

  const [state, setState] = useState<KeyedState>(() => idleState(key))
  // Bumped on reset, key change and unmount, so a late result of an older
  // attempt is dropped.
  const attemptRef = useRef(0)
  const inFlightRef = useRef(false)
  const onManageLoadedRef = useRef(onManageLoaded)
  useEffect(() => {
    onManageLoadedRef.current = onManageLoaded
  })

  useEffect(() => {
    attemptRef.current += 1
    inFlightRef.current = false
    return () => {
      attemptRef.current += 1
      inFlightRef.current = false
    }
  }, [key])

  const refreshManage = useCallback(() => {
    fetchJpoolManage(wallet, voteAccount, network, { refresh: true })
      .then((manage) => onManageLoadedRef.current?.(manage))
      .catch((error) => console.error('JPool Manage refresh after bind failed:', error))
  }, [wallet, voteAccount, network])

  const bind = useCallback(async () => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    const attempt = ++attemptRef.current
    const isCurrent = () => attempt === attemptRef.current
    const update = (next: Omit<KeyedState, 'key'>) => {
      if (isCurrent()) setState({ key, ...next })
    }

    try {
      // Built once per click; the signed bytes and the POSTed string are the same.
      const message = buildJpoolBindMessage(wallet, voteAccount)
      const messageBytes = new TextEncoder().encode(message)
      update({ status: 'signing', result: null, error: null })

      let signed: { signature: Uint8Array; signedMessage: Uint8Array }
      try {
        signed = await signMessage({ message: messageBytes })
      } catch (error) {
        if (!isCurrent()) return
        if (isWalletRejection(error)) {
          update({ status: 'rejected', result: null, error: null })
        } else {
          console.error('JPool bind: wallet signing failed:', error)
          update({ status: 'error', result: null, error: hookError('SIGN_FAILED') })
        }
        return
      }
      if (!isCurrent()) return

      // A wallet that altered the message signed something else: never send it.
      if (!bytesEqual(signed.signedMessage, messageBytes)) {
        update({ status: 'error', result: null, error: hookError('MESSAGE_MODIFIED') })
        return
      }
      if (signed.signature.length !== SIGNATURE_BYTES) {
        update({ status: 'error', result: null, error: hookError('INVALID_SIGNATURE') })
        return
      }

      update({ status: 'submitting', result: null, error: null })
      try {
        const response = await bindJpoolWallet(network, {
          wallet,
          signature: getBase64Decoder().decode(signed.signature),
          message,
        })
        if (!isCurrent()) return
        update({ status: 'success', result: { alreadyBound: response.alreadyBound }, error: null })
        refreshManage()
      } catch (error) {
        if (!isCurrent()) return
        const code = error instanceof BackendRequestError ? error.code : undefined
        const boundTo = code === 'JPOOL_BOUND_ELSEWHERE' ? jpoolBoundToVoteId(error) : null
        if (boundTo) {
          update({ status: 'bound_elsewhere', result: { boundTo }, error: null })
          refreshManage()
          return
        }
        if (!(error instanceof BackendRequestError)) {
          console.error('JPool bind request failed:', error)
        }
        const retryAfterSeconds = jpoolRetryAfterSeconds(error)
        update({
          status: 'error',
          result: null,
          error: {
            code: code ?? 'BIND_FAILED',
            text: getJpoolBindErrorText(code, retryAfterSeconds),
            retryAfterSeconds,
          },
        })
      }
    } finally {
      if (isCurrent()) inFlightRef.current = false
    }
  }, [key, wallet, voteAccount, network, signMessage, refreshManage])

  const reset = useCallback(() => {
    attemptRef.current += 1
    inFlightRef.current = false
    setState(idleState(key))
  }, [key])

  // A state recorded for another wallet, vote or network is never shown.
  const current = state.key === key ? state : idleState(key)
  return {
    status: current.status,
    result: current.result,
    error: current.error,
    bind,
    reset,
  }
}
