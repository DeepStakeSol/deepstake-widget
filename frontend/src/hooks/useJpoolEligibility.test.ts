import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { fetchJpoolEligibilityMock } = vi.hoisted(() => ({ fetchJpoolEligibilityMock: vi.fn() }))
vi.mock('../utils/jpool', () => ({ fetchJpoolEligibility: fetchJpoolEligibilityMock }))

import { isJpoolTabVisible, useJpoolEligibility } from './useJpoolEligibility'

type Props = { required: boolean; vote: string; network: string }

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

const verdict = (eligible: boolean, source = 'jpool') => ({
  eligible,
  reason: eligible ? null : 'blocked',
  epoch: 1,
  source,
})

describe('useJpoolEligibility', () => {
  beforeEach(() => {
    fetchJpoolEligibilityMock.mockReset()
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  it('is not_required without a JPool tab or vote', () => {
    const { result, rerender } = renderHook(
      (p: Props) => useJpoolEligibility(p.required, p.vote, p.network),
      {
        initialProps: { required: false, vote: 'vote', network: 'mainnet' },
      }
    )
    expect(result.current).toEqual({ status: 'not_required', reason: null })
    rerender({ required: true, vote: '', network: 'mainnet' })
    expect(result.current.status).toBe('not_required')
    expect(fetchJpoolEligibilityMock).not.toHaveBeenCalled()
  })

  it.each([
    [verdict(true), 'eligible'],
    [verdict(false), 'ineligible'],
    [verdict(true, 'fallback'), 'fallback'],
  ])('maps %j to %s', async (answer, status) => {
    fetchJpoolEligibilityMock.mockResolvedValue(answer)
    const { result } = renderHook(() => useJpoolEligibility(true, 'vote', 'mainnet'))
    expect(result.current.status).toBe('pending')
    await waitFor(() => expect(result.current.status).toBe(status))
  })

  it('drops an answer for a previous vote and goes back to pending', async () => {
    const first = deferred<ReturnType<typeof verdict>>()
    const second = deferred<ReturnType<typeof verdict>>()
    fetchJpoolEligibilityMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const { result, rerender } = renderHook(
      (p: Props) => useJpoolEligibility(p.required, p.vote, p.network),
      {
        initialProps: { required: true, vote: 'vote-a', network: 'mainnet' },
      }
    )
    const firstSignal = fetchJpoolEligibilityMock.mock.calls[0][2].signal as AbortSignal

    rerender({ required: true, vote: 'vote-b', network: 'mainnet' })
    expect(firstSignal.aborted).toBe(true)
    first.resolve(verdict(false))
    await Promise.resolve()
    expect(result.current.status).toBe('pending')

    second.resolve(verdict(true))
    await waitFor(() => expect(result.current.status).toBe('eligible'))
  })

  it('aborts the request on unmount', () => {
    fetchJpoolEligibilityMock.mockReturnValue(new Promise(() => undefined))
    const { unmount } = renderHook(() => useJpoolEligibility(true, 'vote', 'mainnet'))
    const signal = fetchJpoolEligibilityMock.mock.calls[0][2].signal as AbortSignal
    unmount()
    expect(signal.aborted).toBe(true)
  })

  it('shows the tab only for eligible and fallback', () => {
    expect(isJpoolTabVisible('eligible')).toBe(true)
    expect(isJpoolTabVisible('fallback')).toBe(true)
    expect(isJpoolTabVisible('pending')).toBe(false)
    expect(isJpoolTabVisible('ineligible')).toBe(false)
    expect(isJpoolTabVisible('not_required')).toBe(false)
  })
})
