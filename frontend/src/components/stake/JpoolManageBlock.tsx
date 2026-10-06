import { useEffect, useState } from 'react'
import type { UiWalletAccount } from '@wallet-standard/react'
import {
  JPOOL_DATA_UNAVAILABLE_TEXT,
  jpoolDirectStakeUrl,
  type JpoolManageResponse,
} from '../../utils/jpool'
import { formatLamportsFixed } from '../../utils/lamports'
import { cssImageUrl } from '../../utils/imageUrl'
import { fetchValidatorProfile, type ValidatorProfile } from '../../utils/solana/validator'
import type { NetworkType } from '../../utils/config'
import { JpoolManageBind } from './JpoolManageBind'

export const JUPITER_URL = 'https://jup.ag'

// Manage amounts use 5 decimals, as in the design.
const DISPLAY_DECIMALS = 5

interface Props {
  data: JpoolManageResponse | null
  network: NetworkType
  validatorInfo?: ValidatorProfile | null
  widgetVoteAccount: string
  // The connected wallet; enables the Bind control (J2-3).
  account?: UiWalletAccount
  onManageLoaded?: (manage: JpoolManageResponse) => void
}

function truncateAddress(address: string, chars = 6): string {
  if (address.length <= chars * 2 + 2) return address
  return `${address.slice(0, chars)}...${address.slice(-chars)}`
}

function parseAmount(value: string | null | undefined): bigint | null {
  return value && /^\d+$/.test(value) ? BigInt(value) : null
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

type StakedTo =
  | { tone: 'here'; text: string; title?: string }
  | { tone: 'elsewhere'; text: string; title?: string }
  | { tone: 'none' | 'unknown'; text: string }

export function JpoolManageBlock({
  data,
  network,
  validatorInfo,
  widgetVoteAccount,
  account,
  onManageLoaded,
}: Props) {
  const elsewhereVoteId =
    data?.uiStatus === 'bound_elsewhere' && data.binding ? data.binding.voteId : null
  const elsewhereName = useBoundElsewhereName(elsewhereVoteId, network)

  if (!data) {
    return (
      <>
        <div className="jm-wrap">
          <p className="jm-note jm-warn">{JPOOL_DATA_UNAVAILABLE_TEXT}</p>
          <JmUnstake />
        </div>
        <JmStyles />
      </>
    )
  }

  const validatorName = validatorInfo?.name || truncateAddress(widgetVoteAccount)
  const walletBalance = parseAmount(data.walletAtaBalance)
  const counted = parseAmount(data.countedForValidator)
  const totalLamports = parseAmount(data.poolRate?.totalLamports)
  const poolTokenSupply = parseAmount(data.poolRate?.poolTokenSupply)
  const countedSol =
    counted !== null && totalLamports !== null && poolTokenSupply
      ? (counted * totalLamports) / poolTokenSupply
      : null
  const showMatchingHint =
    data.uiStatus === 'bound_here' &&
    counted !== null &&
    walletBalance !== null &&
    counted < walletBalance

  // Counted first: anything JPool counts for this validator (memo deposits or a
  // binding here) names it, even when the binding points elsewhere.
  let stakedTo: StakedTo
  if ((counted !== null && counted > BigInt(0)) || data.uiStatus === 'bound_here') {
    stakedTo = { tone: 'here', text: validatorName, title: widgetVoteAccount }
  } else if (data.uiStatus === 'bound_elsewhere') {
    stakedTo = {
      tone: 'elsewhere',
      text: elsewhereName || truncateAddress(data.binding?.voteId ?? ''),
      title: data.binding?.voteId,
    }
  } else if (data.uiStatus === 'not_bound' && counted !== null) {
    stakedTo = { tone: 'none', text: 'NOT DIRECT STAKED TO ANY VALIDATOR' }
  } else {
    stakedTo = { tone: 'unknown', text: 'STATUS TEMPORARILY UNAVAILABLE' }
  }

  return (
    <>
      <div className="jm-wrap">
        <div className="jm-grid">
          <div className="jm-cell">
            <div className="jm-label">Staked to:</div>
            <div
              className={`jm-validator jm-tone-${stakedTo.tone}`}
              title={'title' in stakedTo ? stakedTo.title : undefined}
            >
              {stakedTo.text}
            </div>
            {/* TEMP(JPOOL-TMP-18): bind cannot overwrite another binding (C-03);
                the widget points to the JPool app instead of re-binding. */}
            {data.uiStatus === 'bound_elsewhere' && (
              <p className="jm-note jm-warn">
                Your JPool binding points to another validator. Unbind it in the{' '}
                <a
                  href={jpoolDirectStakeUrl(widgetVoteAccount)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  JPool app
                </a>{' '}
                to bind it to {validatorName}.
              </p>
            )}
          </div>

          <div className="jm-cell">
            <div className="jm-label">Summary stake:</div>
            {counted === null ? (
              <div className="jm-value jm-muted">temporarily unavailable</div>
            ) : (
              <div className="jm-value">
                {countedSol !== null
                  ? `${formatLamportsFixed(countedSol, DISPLAY_DECIMALS)} SOL`
                  : `${formatLamportsFixed(counted, DISPLAY_DECIMALS)} JSOL`}
                <span
                  className="jm-tooltip"
                  data-tooltip={`JSOL that JPool counts for ${validatorName}, in SOL at the current pool rate.`}
                />
              </div>
            )}
            {showMatchingHint && (
              <p className="jm-note jm-hint">
                JPool refreshes balances in the background. Matching updates next epoch.
              </p>
            )}
          </div>

          <div className="jm-cell">
            <div className="jm-label">Your balance:</div>
            {walletBalance === null ? (
              <div className="jm-value jm-muted">temporarily unavailable</div>
            ) : (
              <div className="jm-value">
                {formatLamportsFixed(walletBalance, DISPLAY_DECIMALS)} JSOL
              </div>
            )}
          </div>

          {/* The empty 4th cell hosts the Bind control, so the tab keeps its height. */}
          <div className="jm-cell jm-bind-cell" data-testid="jpool-bind-cell">
            {account && (
              <JpoolManageBind
                account={account}
                data={data}
                network={network}
                voteAccount={widgetVoteAccount}
                validatorName={validatorName}
                onManageLoaded={onManageLoaded}
              />
            )}
          </div>
        </div>

        {data.uiStatus === 'error' && (
          <p className="jm-note jm-warn">{JPOOL_DATA_UNAVAILABLE_TEXT}</p>
        )}

        <JmUnstake />
      </div>
      <JmStyles />
    </>
  )
}

function JmUnstake() {
  return (
    <div className="jm-unstake">
      <p>
        To unstake it, sell them through your wallet or DEX.
        <br />
        When selling, the distribution of direct stake will change proportionally.
      </p>
      <a href={JUPITER_URL} target="_blank" rel="noopener noreferrer" className="jm-jupiter">
        Jupiter
      </a>
    </div>
  )
}

function JmStyles() {
  return (
    <style>{`
      [data-widget="deepstake"] .jm-wrap {
        box-sizing: border-box;
        width: 100%;
        padding: 0 30px;
        color: #000;
      }

      [data-widget="deepstake"] .jm-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        column-gap: 24px;
        row-gap: 16px;
        margin: 16px 0 0;
      }

      [data-widget="deepstake"] .jm-cell { min-width: 0; }

      [data-widget="deepstake"] .jm-label {
        font-size: 13px;
        font-weight: 600;
        margin-bottom: 6px;
      }

      [data-widget="deepstake"] .jm-validator,
      [data-widget="deepstake"] .jm-value {
        font-size: 13px;
        font-weight: 400;
        line-height: 1.4;
        overflow-wrap: anywhere;
      }

      [data-widget="deepstake"] .jm-validator { text-transform: uppercase; }
      [data-widget="deepstake"] .jm-value { display: inline-flex; align-items: center; }

      [data-widget="deepstake"] .jm-tone-here { color: #18864b; }
      [data-widget="deepstake"] .jm-tone-elsewhere { color: #a76100; }
      [data-widget="deepstake"] .jm-tone-none,
      [data-widget="deepstake"] .jm-tone-unknown,
      [data-widget="deepstake"] .jm-muted { color: #aaa; }

      /* Self-contained copy of the q-mark tooltip: the shared rules live in
         components that are not mounted on the Manage tab. */
      [data-widget="deepstake"] .jm-tooltip {
        display: inline-block;
        position: relative;
        width: 13px;
        height: 13px;
        margin-left: 6px;
        flex-shrink: 0;
        background-image: ${cssImageUrl('/images/q_mark.png')};
        background-size: contain;
        background-repeat: no-repeat;
        cursor: help;
      }

      [data-widget="deepstake"] .jm-tooltip:hover::after {
        content: attr(data-tooltip);
        position: absolute;
        right: 100%;
        top: -8px;
        margin-right: 6px;
        width: 150px;
        background: #E5E4E4;
        color: #000;
        font-size: 10px;
        font-weight: 400;
        line-height: 1.2;
        border-radius: 6px;
        padding: 8px 10px;
        z-index: 1000;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
      }

      [data-widget="deepstake"] .jm-note {
        margin: 6px 0 0;
        font-size: 11px;
        line-height: 1.4;
      }

      [data-widget="deepstake"] .jm-note a { color: inherit; text-decoration: underline; }
      [data-widget="deepstake"] .jm-hint { color: #1a6fa8; }
      [data-widget="deepstake"] .jm-warn { color: #a76100; }

      /* The Manage tab content is 315 px tall; this fits the design without
         scrolling for a one-line validator name. */
      [data-widget="deepstake"] .jm-unstake {
        padding: 20px 0 4px;
        /* the text may use the right padding, as in the design */
        margin-right: -30px;
      }

      [data-widget="deepstake"] .jm-unstake p {
        margin: 0 0 10px;
        color: #777;
        font-size: 11px;
        line-height: 1.5;
      }

      [data-widget="deepstake"] .jm-jupiter {
        display: inline-block;
        background: #E5E4E4;
        color: #555;
        text-decoration: none;
        padding: 4px 0;
        border-radius: 12px;
        font-weight: 500;
        width: 120px;
        text-align: center;
        font-size: 13px;
      }

      [data-widget="deepstake"] .jm-jupiter:hover { opacity: 0.8; }

      /* Bind pill: Jupiter pill size, Stake button colours (primary action).
         No Figma frame; pending design review. */
      [data-widget="deepstake"] .jm-bind-row { display: flex; align-items: center; }
      [data-widget="deepstake"] .jm-bind-button {
        width: 120px;
        padding: 4px 0;
        border: 0;
        border-radius: 12px;
        background: #5A5A62;
        color: #fff;
        font: inherit;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
      }
      [data-widget="deepstake"] .jm-bind-button:hover:not(:disabled) { opacity: 0.85; }
      [data-widget="deepstake"] .jm-bind-button:disabled { opacity: 0.6; cursor: default; }
      [data-widget="deepstake"] .jm-bind-status {
        margin: 0;
        font-size: 13px;
        line-height: 1.4;
      }

      [data-widget="deepstake"][data-theme="dark"] .jm-wrap { color: #fff; }
      [data-widget="deepstake"][data-theme="dark"] .jm-tone-here { color: #5fd38d; }
      [data-widget="deepstake"][data-theme="dark"] .jm-tone-elsewhere,
      [data-widget="deepstake"][data-theme="dark"] .jm-warn { color: #f4b860; }
      [data-widget="deepstake"][data-theme="dark"] .jm-tone-none,
      [data-widget="deepstake"][data-theme="dark"] .jm-tone-unknown,
      [data-widget="deepstake"][data-theme="dark"] .jm-muted,
      [data-widget="deepstake"][data-theme="dark"] .jm-unstake p { color: #9F9FAC; }
      [data-widget="deepstake"][data-theme="dark"] .jm-hint { color: #6ab8f0; }
      [data-widget="deepstake"][data-theme="dark"] .jm-jupiter { background: #5A5A62; color: #9F9FAC; }
      [data-widget="deepstake"][data-theme="dark"] .jm-bind-button { background: #D9D9D9; color: #000; }
      [data-widget="deepstake"][data-theme="dark"] .jm-tooltip {
        background-image: ${cssImageUrl('/images/q_mark_dk.png')};
      }
      [data-widget="deepstake"][data-theme="dark"] .jm-tooltip:hover::after {
        background: #090F19;
        color: #9F9FAC;
      }
    `}</style>
  )
}
