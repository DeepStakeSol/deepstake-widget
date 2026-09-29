import { useEffect, useState } from 'react'
import { JPOOL_DATA_UNAVAILABLE_TEXT, type JpoolManageResponse } from '../../utils/jpool'
import { formatLamports } from '../../utils/lamports'
import { fetchValidatorProfile, type ValidatorProfile } from '../../utils/solana/validator'
import type { NetworkType } from '../../utils/config'

export const JPOOL_APP_URL = 'https://app.jpool.one'
export const JUPITER_URL = 'https://jup.ag'

interface Props {
  data: JpoolManageResponse | null
  isLoading: boolean
  network: NetworkType
  validatorInfo?: ValidatorProfile | null
  widgetVoteAccount: string
}

function truncateAddress(address: string, chars = 6): string {
  if (address.length <= chars * 2 + 2) return address
  return `${address.slice(0, chars)}...${address.slice(-chars)}`
}

function parseAmount(value: string | null | undefined): bigint | null {
  return value && /^\d+$/.test(value) ? BigInt(value) : null
}

function formatJsol(value: bigint): string {
  return `${formatLamports(value, 6)} JSOL`
}

// Name of the validator this wallet is bound to when it is not the widget's
// validator (same lookup as VaultBindingBlock).
function useBoundElsewhereName(voteId: string | null, network: NetworkType) {
  const lookupKey = voteId ? `${network}:${voteId}` : null
  const [state, setState] = useState<{ key: string; name: string | null } | null>(null)

  useEffect(() => {
    if (!lookupKey || !voteId) return
    let cancelled = false
    fetchValidatorProfile(voteId, network)
      .then((profile) => {
        if (!cancelled) setState({ key: lookupKey, name: profile.name })
      })
      .catch(() => {
        if (!cancelled) setState({ key: lookupKey, name: null })
      })
    return () => {
      cancelled = true
    }
  }, [lookupKey, voteId, network])

  return state?.key === lookupKey ? state.name : null
}

export function JpoolManageBlock({
  data,
  isLoading,
  network,
  validatorInfo,
  widgetVoteAccount,
}: Props) {
  const elsewhereVoteId =
    data?.uiStatus === 'bound_elsewhere' && data.binding ? data.binding.voteId : null
  const elsewhereName = useBoundElsewhereName(elsewhereVoteId, network)

  if (isLoading && !data) {
    return (
      <>
        <div className="jm-wrap">
          <div className="jm-row jm-muted">Loading JPool data…</div>
        </div>
        <JmStyles />
      </>
    )
  }

  if (!data) {
    return (
      <>
        <div className="jm-wrap">
          <div className="jm-row jm-warn">{JPOOL_DATA_UNAVAILABLE_TEXT}</div>
        </div>
        <JmStyles />
      </>
    )
  }

  const validatorName = validatorInfo?.name || truncateAddress(widgetVoteAccount)
  const walletBalance = parseAmount(data.walletAtaBalance)
  const counted = parseAmount(data.countedForValidator)
  const rate = data.poolRate
    ? {
        totalLamports: parseAmount(data.poolRate.totalLamports),
        poolTokenSupply: parseAmount(data.poolRate.poolTokenSupply),
      }
    : null
  const countedSol =
    counted !== null && rate?.totalLamports && rate.poolTokenSupply
      ? (counted * rate.totalLamports) / rate.poolTokenSupply
      : null
  const showMatchingHint =
    data.uiStatus === 'bound_here' &&
    counted !== null &&
    walletBalance !== null &&
    counted < walletBalance

  let boundTo: { text: string; tone: 'here' | 'elsewhere' | 'none' | 'unknown'; title?: string }
  switch (data.uiStatus) {
    case 'bound_here':
      boundTo = { text: validatorName, tone: 'here', title: data.binding?.voteId }
      break
    case 'bound_elsewhere':
      boundTo = {
        text: elsewhereName || truncateAddress(data.binding?.voteId ?? ''),
        tone: 'elsewhere',
        title: data.binding?.voteId,
      }
      break
    case 'not_bound':
      boundTo = { text: 'Not bound to any validator', tone: 'none' }
      break
    default:
      boundTo = { text: 'Status temporarily unavailable', tone: 'unknown' }
  }

  return (
    <>
      <div className="jm-wrap">
        <div className="jm-row">
          <span className="jm-label">Bound to:</span>{' '}
          <span className={`jm-status jm-status-${boundTo.tone}`} title={boundTo.title}>
            {boundTo.text}
          </span>
        </div>

        <div className="jm-row">
          <span className="jm-label">Directed to {validatorName}:</span>{' '}
          {counted !== null ? (
            <span className="jm-value">
              {formatJsol(counted)}
              {countedSol !== null && ` (~${formatLamports(countedSol, 6)} SOL)`}
            </span>
          ) : (
            <span className="jm-muted">temporarily unavailable</span>
          )}
        </div>

        <div className="jm-row">
          <span className="jm-label">Your balance:</span>{' '}
          {walletBalance !== null ? (
            <span className="jm-value">{formatJsol(walletBalance)}</span>
          ) : (
            <span className="jm-muted">temporarily unavailable</span>
          )}
        </div>

        {showMatchingHint && (
          <div className="jm-row jm-hint">
            JPool refreshes balances in the background. Matching updates next epoch.
          </div>
        )}

        {data.uiStatus === 'error' && (
          <div className="jm-row jm-warn">{JPOOL_DATA_UNAVAILABLE_TEXT}</div>
        )}

        {/* J2-3 renders the Bind / Re-bind controls here. */}
        <div className="jm-bind-slot" data-testid="jpool-bind-slot" />

        <div className="jm-unstake">
          <p>
            To unstake, convert JSOL back to SOL in the JPool app (instant for a higher fee, or
            delayed until the epoch ends for a lower fee), or swap JSOL on a DEX. Selling or moving
            JSOL reduces the stake counted for the validator.
          </p>
          <div className="jm-links">
            <a href={JPOOL_APP_URL} target="_blank" rel="noopener noreferrer" className="jm-link">
              JPool app
            </a>
            <a href={JUPITER_URL} target="_blank" rel="noopener noreferrer" className="jm-link">
              Jupiter
            </a>
          </div>
        </div>
      </div>
      <JmStyles />
    </>
  )
}

function JmStyles() {
  return (
    <style>{`
      [data-widget="deepstake"] .jm-wrap {
        box-sizing: border-box;
        width: 100%;
        padding: 0 30px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        font-size: 14px;
        color: #111;
      }

      [data-widget="deepstake"] .jm-label {
        color: #888;
      }

      [data-widget="deepstake"] .jm-value,
      [data-widget="deepstake"] .jm-status {
        font-family: monospace;
        font-weight: 600;
      }

      [data-widget="deepstake"] .jm-status-here { color: #18864b; }
      [data-widget="deepstake"] .jm-status-elsewhere { color: #a76100; }
      [data-widget="deepstake"] .jm-status-none,
      [data-widget="deepstake"] .jm-status-unknown,
      [data-widget="deepstake"] .jm-muted { color: #aaa; font-weight: 400; }

      [data-widget="deepstake"] .jm-hint { color: #1a6fa8; font-size: 12px; }
      [data-widget="deepstake"] .jm-warn { color: #a76100; font-size: 13px; line-height: 1.5; }

      [data-widget="deepstake"] .jm-unstake {
        margin-top: 10px;
        background: #fff;
        border-radius: 10px;
        padding: 20px 0 30px;
      }

      [data-widget="deepstake"] .jm-unstake p {
        margin: 0 0 10px;
        color: #555;
        font-size: 13px;
        line-height: 1.5;
      }

      [data-widget="deepstake"] .jm-links {
        display: flex;
        gap: 10px;
      }

      [data-widget="deepstake"] .jm-link {
        display: inline-block;
        background: #E5E4E4;
        color: #000;
        text-decoration: none;
        padding: 0 16px;
        border-radius: 10px;
        font-weight: 500;
        height: 24px;
        min-width: 100px;
        text-align: center;
        font-size: 16px;
      }

      [data-widget="deepstake"] .jm-link:hover { opacity: 0.8; }

      [data-widget="deepstake"][data-theme="dark"] .jm-wrap { color: #fff; }
      [data-widget="deepstake"][data-theme="dark"] .jm-label,
      [data-widget="deepstake"][data-theme="dark"] .jm-muted,
      [data-widget="deepstake"][data-theme="dark"] .jm-status-none,
      [data-widget="deepstake"][data-theme="dark"] .jm-status-unknown,
      [data-widget="deepstake"][data-theme="dark"] .jm-unstake p { color: #9F9FAC; }
      [data-widget="deepstake"][data-theme="dark"] .jm-status-here { color: #5fd38d; }
      [data-widget="deepstake"][data-theme="dark"] .jm-status-elsewhere,
      [data-widget="deepstake"][data-theme="dark"] .jm-warn { color: #f4b860; }
      [data-widget="deepstake"][data-theme="dark"] .jm-hint { color: #6ab8f0; }
      [data-widget="deepstake"][data-theme="dark"] .jm-unstake { background: transparent; }
      [data-widget="deepstake"][data-theme="dark"] .jm-link { background: #5A5A62; color: #9F9FAC; }
    `}</style>
  )
}
