import { act, renderHook, waitFor } from '@testing-library/react'
import type { UiWalletAccount } from '@wallet-standard/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BackendRequestError } from '../utils/backendRequest'

const mocks = vi.hoisted(() => ({
  signMessage: vi.fn(),
  bind: vi.fn(),
  manage: vi.fn(),
}))

vi.mock('@solana/react', () => ({ useSignMessage: () => mocks.signMessage }))
vi.mock('../utils/jpool', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../utils/jpool')>()),
  bindJpoolWallet: mocks.bind,
  fetchJpoolManage: mocks.manage,
}))

import { isWalletRejection, useJpoolBind, type UseJpoolBindParams } from './useJpoolBind'

const WALLET = '6vCSEqLYhE88vyppdpi7wa3aVbZhKffuAFcQhwqFfV3'
const OTHER_WALLET = 'DeEpSdaw8uBLQ5T2HQhDf8fBSVbm13jGqJwoSF3HTpL5'
const VOTE = 'DeEpSdaw8uBLQ5T2HQhDf8fBSVbm13jGqJwoSF3HTpL5'
const OTHER_VOTE = 'Vote111111111111111111111111111111111111111'
const NOW = 1_790_956_418_243
const SIGNATURE = new Uint8Array(64).fill(7)
const SIGNATURE_BASE64 = Buffer.from(SIGNATURE).toString('base64')

function account(address = WALLET): UiWalletAccount {
  return {
    address,
    publicKey: new Uint8Array(32),
    chains: ['solana:mainnet'],
    features: ['solana:signMessage'],
  } as unknown as UiWalletAccount
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

// Echoes the requested bytes, as a well-behaved wallet does.
function signsHonestly() {
  mocks.signMessage.mockImplementation(async ({ message }: { message: Uint8Array }) => ({
    signature: SIGNATURE,
    signedMessage: message,
  }))
}

function backendError(status: number, body: Record<string, unknown>) {
  return new BackendRequestError(String(body.error ?? 'error'), {
    status,
    code: body.code as string,
    body,
  })
}

const MANAGE = { uiStatus: 'bound_here' }

function setup(overrides: Partial<UseJpoolBindParams> = {}) {
  const onManageLoaded = vi.fn()
  const hook = renderHook((props: UseJpoolBindParams) => useJpoolBind(props), {
    initialProps: {
      account: account(),
      voteAccount: VOTE,
      network: 'mainnet',
      onManageLoaded,
      ...overrides,
    },
  })
  return { ...hook, onManageLoaded }
}

describe('useJpoolBind', () => {
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.signMessage.mockReset()
    mocks.bind.mockReset().mockResolvedValue({ success: true, alreadyBound: false, voteId: VOTE })
    mocks.manage.mockReset().mockResolvedValue(MANAGE)
    signsHonestly()
  })

  it('signs the exact message, posts the same string and refreshes Manage', async () => {
    const { result, onManageLoaded } = setup()
    expect(result.current.status).toBe('idle')

    await act(() => result.current.bind())

    const message = JSON.stringify({ wallet: WALLET, action: 'bindWallet', voteId: VOTE, timestamp: NOW })
    const signed = mocks.signMessage.mock.calls[0][0].message as Uint8Array
    expect(new TextDecoder().decode(signed)).toBe(message)
    expect(mocks.bind).toHaveBeenCalledWith('mainnet', {
      wallet: WALLET,
      signature: SIGNATURE_BASE64,
      message,
    })
    expect(SIGNATURE_BASE64).toHaveLength(88)
    expect(result.current.status).toBe('success')
    expect(result.current.result).toEqual({ alreadyBound: false })
    expect(mocks.manage).toHaveBeenCalledWith(WALLET, VOTE, 'mainnet', { refresh: true })
    await waitFor(() => expect(onManageLoaded).toHaveBeenCalledWith(MANAGE))
  })

  it('goes through signing and submitting', async () => {
    const signing = deferred<{ signature: Uint8Array; signedMessage: Uint8Array }>()
    const submitting = deferred<unknown>()
    mocks.signMessage.mockReturnValue(signing.promise)
    mocks.bind.mockReturnValue(submitting.promise)
    const { result } = setup()

    let done!: Promise<void>
    act(() => {
      done = result.current.bind()
    })
    expect(result.current.status).toBe('signing')

    const message = mocks.signMessage.mock.calls[0][0].message
    await act(async () => signing.resolve({ signature: SIGNATURE, signedMessage: message }))
    expect(result.current.status).toBe('submitting')

    await act(async () => {
      submitting.resolve({ success: true, alreadyBound: true, voteId: VOTE })
      await done
    })
    expect(result.current.status).toBe('success')
    expect(result.current.result).toEqual({ alreadyBound: true })
  })

  it('reports bound_elsewhere with boundTo and refreshes Manage', async () => {
    mocks.bind.mockRejectedValue(
      backendError(409, { code: 'JPOOL_BOUND_ELSEWHERE', boundTo: { voteId: OTHER_VOTE } })
    )
    const { result } = setup()
    await act(() => result.current.bind())
    expect(result.current.status).toBe('bound_elsewhere')
    expect(result.current.result).toEqual({ boundTo: OTHER_VOTE })
    expect(mocks.manage).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['code 4001', Object.assign(new Error('Something'), { code: 4001 })],
    ['a rejection message', new Error('User rejected the request.')],
  ])('treats %s as a user rejection without posting', async (_name, error) => {
    mocks.signMessage.mockRejectedValue(error)
    const { result } = setup()
    await act(() => result.current.bind())
    expect(result.current.status).toBe('rejected')
    expect(result.current.error).toBeNull()
    expect(mocks.bind).not.toHaveBeenCalled()
    expect(mocks.signMessage).toHaveBeenCalledTimes(1)
  })

  it('reports other signing failures as errors', async () => {
    mocks.signMessage.mockRejectedValue(new Error('Wallet disconnected'))
    const { result } = setup()
    await act(() => result.current.bind())
    expect(result.current.status).toBe('error')
    expect(result.current.error?.code).toBe('SIGN_FAILED')
    expect(mocks.bind).not.toHaveBeenCalled()
  })

  it('never posts when the wallet signed different bytes', async () => {
    mocks.signMessage.mockResolvedValue({
      signature: SIGNATURE,
      signedMessage: new TextEncoder().encode('something else'),
    })
    const { result } = setup()
    await act(() => result.current.bind())
    expect(result.current.error?.code).toBe('MESSAGE_MODIFIED')
    expect(mocks.bind).not.toHaveBeenCalled()
  })

  it('never posts a signature of the wrong length', async () => {
    mocks.signMessage.mockImplementation(async ({ message }: { message: Uint8Array }) => ({
      signature: new Uint8Array(63),
      signedMessage: message,
    }))
    const { result } = setup()
    await act(() => result.current.bind())
    expect(result.current.error?.code).toBe('INVALID_SIGNATURE')
    expect(mocks.bind).not.toHaveBeenCalled()
  })

  it.each([
    ['JPOOL_BIND_EXPIRED', 400, {}, /expired/],
    ['JPOOL_RATE_LIMITED', 429, { retryAfterSeconds: 42 }, /42 seconds/],
    ['JPOOL_UNAVAILABLE', 503, {}, /temporarily unavailable/],
    ['JPOOL_BIND_REJECTED', 422, {}, /did not accept/],
  ])('maps %s to an error text', async (code, status, extra, text) => {
    mocks.bind.mockRejectedValue(backendError(status, { code, ...extra }))
    const { result } = setup()
    await act(() => result.current.bind())
    expect(result.current.status).toBe('error')
    expect(result.current.error?.code).toBe(code)
    expect(result.current.error?.text).toMatch(text)
    expect(mocks.manage).not.toHaveBeenCalled()
  })

  it('keeps the retry delay for rate limits', async () => {
    mocks.bind.mockRejectedValue(
      backendError(429, { code: 'JPOOL_RATE_LIMITED', retryAfterSeconds: 9 })
    )
    const { result } = setup()
    await act(() => result.current.bind())
    expect(result.current.error?.retryAfterSeconds).toBe(9)
  })

  it('reports a network failure as BIND_FAILED', async () => {
    mocks.bind.mockRejectedValue(new TypeError('Failed to fetch'))
    const { result } = setup()
    await act(() => result.current.bind())
    expect(result.current.error?.code).toBe('BIND_FAILED')
  })

  it('makes one signing request and one POST on a double click', async () => {
    const { result } = setup()
    await act(async () => {
      const first = result.current.bind()
      const second = result.current.bind()
      await Promise.all([first, second])
    })
    expect(mocks.signMessage).toHaveBeenCalledTimes(1)
    expect(mocks.bind).toHaveBeenCalledTimes(1)
  })

  it('can bind again after a finished attempt', async () => {
    mocks.signMessage.mockRejectedValueOnce(new Error('User rejected the request.'))
    const { result } = setup()
    await act(() => result.current.bind())
    expect(result.current.status).toBe('rejected')
    await act(() => result.current.bind())
    expect(result.current.status).toBe('success')
    expect(mocks.signMessage).toHaveBeenCalledTimes(2)
  })

  it('drops a signature that arrives after unmount', async () => {
    const signing = deferred<{ signature: Uint8Array; signedMessage: Uint8Array }>()
    mocks.signMessage.mockReturnValue(signing.promise)
    const { result, unmount } = setup()
    let done!: Promise<void>
    act(() => {
      done = result.current.bind()
    })
    const message = mocks.signMessage.mock.calls[0][0].message
    unmount()
    await act(async () => {
      signing.resolve({ signature: SIGNATURE, signedMessage: message })
      await done
    })
    expect(mocks.bind).not.toHaveBeenCalled()
  })

  it('ignores a late success after the wallet changes', async () => {
    const submitting = deferred<unknown>()
    mocks.bind.mockReturnValue(submitting.promise)
    const { result, rerender, onManageLoaded } = setup()
    let done!: Promise<void>
    act(() => {
      done = result.current.bind()
    })
    await waitFor(() => expect(result.current.status).toBe('submitting'))

    rerender({ account: account(OTHER_WALLET), voteAccount: VOTE, network: 'mainnet', onManageLoaded })
    expect(result.current.status).toBe('idle')

    await act(async () => {
      submitting.resolve({ success: true, alreadyBound: false, voteId: VOTE })
      await done
    })
    expect(result.current.status).toBe('idle')
    expect(mocks.manage).not.toHaveBeenCalled()
  })

  it('ignores a late result after reset and allows a new attempt', async () => {
    const signing = deferred<{ signature: Uint8Array; signedMessage: Uint8Array }>()
    mocks.signMessage.mockReturnValueOnce(signing.promise)
    const { result } = setup()
    let done!: Promise<void>
    act(() => {
      done = result.current.bind()
    })
    const message = mocks.signMessage.mock.calls[0][0].message
    act(() => result.current.reset())
    expect(result.current.status).toBe('idle')

    await act(async () => {
      signing.resolve({ signature: SIGNATURE, signedMessage: message })
      await done
    })
    expect(result.current.status).toBe('idle')
    expect(mocks.bind).not.toHaveBeenCalled()

    await act(() => result.current.bind())
    expect(result.current.status).toBe('success')
  })

  it('keeps success when the Manage refresh fails', async () => {
    mocks.manage.mockRejectedValue(new Error('down'))
    const { result, onManageLoaded } = setup()
    await act(() => result.current.bind())
    await waitFor(() => expect(console.error).toHaveBeenCalled())
    expect(result.current.status).toBe('success')
    expect(onManageLoaded).not.toHaveBeenCalled()
  })
})

describe('isWalletRejection', () => {
  it('recognises common wallet rejections only', () => {
    expect(isWalletRejection({ code: 4001 })).toBe(true)
    expect(isWalletRejection(new Error('User denied message signature'))).toBe(true)
    expect(isWalletRejection(new Error('Request declined'))).toBe(true)
    expect(isWalletRejection(new Error('Wallet disconnected'))).toBe(false)
    expect(isWalletRejection(null)).toBe(false)
  })
})
