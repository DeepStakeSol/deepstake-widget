import { useEffect, useState } from 'react'
import { fetchJpoolEligibility, type JpoolEligibilityReason } from '../utils/jpool'

export type JpoolEligibilityStatus =
  | 'not_required'
  | 'pending'
  | 'eligible'
  | 'ineligible'
  | 'fallback'

export interface JpoolEligibilityState {
  status: JpoolEligibilityStatus
  reason: JpoolEligibilityReason | null
}

// Whether the JPool tab may be shown in this state. `pending` hides it so the
// tab never appears and then disappears.
export function isJpoolTabVisible(status: JpoolEligibilityStatus): boolean {
  return status === 'eligible' || status === 'fallback'
}

// Resolves eligibility once per (network, vote) when the JPool tab was
// requested. The client fails open after 2 s, so the state is terminal; a
// result for a previous key or an unmounted widget is dropped.
export function useJpoolEligibility(
  required: boolean,
  voteAccount: string,
  network: string
): JpoolEligibilityState {
  const key = required && voteAccount ? `${network}:${voteAccount}` : null
  const [resolved, setResolved] = useState<(JpoolEligibilityState & { key: string }) | null>(null)

  useEffect(() => {
    if (!key) return
    const controller = new AbortController()
    fetchJpoolEligibility(voteAccount, network, { signal: controller.signal })
      .then((result) => {
        const status: JpoolEligibilityStatus =
          result.source === 'fallback' ? 'fallback' : result.eligible ? 'eligible' : 'ineligible'
        if (status === 'ineligible') {
          console.warn(`[DeepStake widget] JPool tab hidden: ${result.reason ?? 'ineligible'}`)
        }
        setResolved({ key, status, reason: result.reason })
      })
      .catch(() => {
        // Aborted: the widget unmounted or the key changed.
      })
    return () => controller.abort()
  }, [key, voteAccount, network])

  if (!key) return { status: 'not_required', reason: null }
  if (resolved?.key !== key) return { status: 'pending', reason: null }
  return { status: resolved.status, reason: resolved.reason }
}
