import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import type { UiWalletAccount } from '@wallet-standard/react'
import { useJpoolBind } from '../../hooks/useJpoolBind'
import { getExplorerTxUrl } from '../../utils/config'
import { getImageUrl } from '../../utils/imageUrl'
import {
  getJpoolBindCapability,
  JPOOL_BIND_LATER_TEXT,
  jpoolDirectStakeUrl,
  type JpoolManageResponse,
} from '../../utils/jpool'
import {
  jpoolBindPromptText,
  jpoolBindPromptTitle,
  jpoolDepositText,
  jpoolRegistrationText,
  type JpoolCompletion,
} from '../../utils/jpoolCopy'
import { JpoolBindUnsupported } from './JpoolBindUnsupported'

export interface JpoolCompletionDialogProps {
  completed: JpoolCompletion
  // Latest Manage read for this deposit run; null until the first answer.
  manage: JpoolManageResponse | null
  // The first post-deposit Manage read failed and nothing newer arrived.
  manageFailed: boolean
  account: UiWalletAccount
  voteAccount: string
  network: string
  validatorName: string
  onManageLoaded: (manage: JpoolManageResponse) => void
  onClose: () => void
}

type KnownBinding = 'not_bound' | 'bound_here' | 'bound_elsewhere'

function knownBinding(manage: JpoolManageResponse | null): KnownBinding | null {
  const status = manage?.uiStatus
  return status === 'not_bound' || status === 'bound_here' || status === 'bound_elsewhere'
    ? status
    : null
}

// The dialog belongs to its own widget: a page may embed several, so the root
// is found from the dialog's position in the tree, not by a global query.
function useWidgetRoot(anchor: RefObject<HTMLElement | null>) {
  const [root, setRoot] = useState<Element | null>(null)
  useLayoutEffect(() => {
    setRoot(anchor.current?.closest('.sw-container') ?? null)
  }, [anchor])
  return root
}

// Post-deposit dialog for the JPool tab (J2-4): deposit success, registration
// progress and an optional Bind step. The deposit result never depends on
// the Bind outcome (issue #7).
// TEMP(JPOOL-TMP-14): own shell and styles copied from StakingModal until a
// shared SuccessModalShell exists; the shared success modal is untouched.
export function JpoolCompletionDialog(props: JpoolCompletionDialogProps) {
  const { completed, validatorName, onClose } = props
  const anchor = useRef<HTMLSpanElement>(null)
  const root = useWidgetRoot(anchor)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    dialogRef.current?.focus()
  }, [root])

  const dialog = (
    <>
      <div className="jcd-overlay" aria-hidden="true" />
      <div
        ref={dialogRef}
        className="jcd-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="jcd-title"
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose()
        }}
      >
        <button type="button" className="jcd-close" aria-label="Close" onClick={onClose}>
          ✕
        </button>
        <h2 id="jcd-title" className="jcd-title">
          Stake sent to JPool
        </h2>
        <img
          className="jcd-logo"
          src={getImageUrl('/images/staking_sol_logo.png')}
          alt=""
          width={90}
          height={81}
        />
        <p className="jcd-text">{jpoolDepositText(completed, validatorName)}</p>
        <p className="jcd-text jcd-muted" role="status">
          {jpoolRegistrationText(completed.registration, validatorName)}
        </p>

        <JpoolCompletionBind {...props} />

        <div className="jcd-links">
          {(['solana-explorer', 'solscan', 'orbmarkets'] as const).map((explorer) => (
            <a
              key={explorer}
              href={getExplorerTxUrl({ signature: completed.signature, explorer })}
              target="_blank"
              rel="noopener noreferrer"
              className="sol-links"
            >
              {explorer === 'solana-explorer'
                ? 'Explorer'
                : explorer === 'solscan'
                  ? 'Solscan'
                  : 'Orb'}
            </a>
          ))}
        </div>
      </div>
      <JcdStyles />
    </>
  )

  return (
    <>
      <span ref={anchor} hidden />
      {root ? createPortal(dialog, root) : dialog}
    </>
  )
}

function JpoolCompletionBind(props: JpoolCompletionDialogProps) {
  const { manage, manageFailed, account, voteAccount, validatorName } = props
  const [skipped, setSkipped] = useState(false)
  // The first known binding status is kept for the life of the dialog, so the
  // step does not change under the user's finger when a later poll answers.
  const frozen = useRef<KnownBinding | null>(null)
  const known = knownBinding(manage)
  if (frozen.current === null && known !== null) frozen.current = known
  const binding = frozen.current

  if (skipped) return null

  if (binding === null) {
    return (
      <div className="jcd-bind">
        <p className="jcd-text jcd-muted">
          {manage === null && !manageFailed
            ? 'Checking your JPool binding…'
            : `Binding status is temporarily unavailable. ${JPOOL_BIND_LATER_TEXT}`}
        </p>
      </div>
    )
  }

  if (binding === 'bound_here') {
    return (
      <div className="jcd-bind">
        <p className="jcd-text jcd-here">Your wallet is already bound to {validatorName}.</p>
      </div>
    )
  }

  if (binding === 'bound_elsewhere') {
    return <BoundElsewhereNote voteAccount={voteAccount} validatorName={validatorName} />
  }

  const capability = getJpoolBindCapability(account)
  if (capability !== 'supported') {
    return (
      <div className="jcd-bind">
        <p className="jcd-bind-title">{jpoolBindPromptTitle(validatorName)}</p>
        <JpoolBindUnsupported voteAccount={voteAccount} reason={capability} />
      </div>
    )
  }
  return <JpoolCompletionBindAction {...props} onSkip={() => setSkipped(true)} />
}

function BoundElsewhereNote({
  voteAccount,
  validatorName,
}: {
  voteAccount: string
  validatorName: string
}) {
  // TEMP(JPOOL-TMP-18): bind cannot overwrite another binding (C-03).
  return (
    <div className="jcd-bind">
      <p className="jcd-text jcd-warn">
        Your JPool binding points to another validator. Unbind it in the{' '}
        <a href={jpoolDirectStakeUrl(voteAccount)} target="_blank" rel="noopener noreferrer">
          JPool app
        </a>{' '}
        to bind it to {validatorName}.
      </p>
    </div>
  )
}

function JpoolCompletionBindAction({
  account,
  voteAccount,
  network,
  validatorName,
  onManageLoaded,
  onSkip,
}: JpoolCompletionDialogProps & { onSkip: () => void }) {
  const { status, result, error, bind } = useJpoolBind({
    account,
    voteAccount,
    network,
    onManageLoaded,
  })

  if (status === 'success') {
    const alreadyBound = result !== null && 'alreadyBound' in result && result.alreadyBound
    return (
      <div className="jcd-bind">
        <p className="jcd-text jcd-here" role="status">
          {alreadyBound ? 'Wallet already bound to' : 'Wallet bound to'} {validatorName}.
        </p>
      </div>
    )
  }
  if (status === 'bound_elsewhere') {
    return <BoundElsewhereNote voteAccount={voteAccount} validatorName={validatorName} />
  }
  if (status === 'rejected' || status === 'error') {
    return (
      <div className="jcd-bind">
        <p className="jcd-text jcd-muted" role="status">
          {status === 'error' && error ? error.text : JPOOL_BIND_LATER_TEXT}
        </p>
      </div>
    )
  }

  const busy = status === 'signing' || status === 'submitting'
  return (
    <div className="jcd-bind">
      <p className="jcd-bind-title">{jpoolBindPromptTitle(validatorName)}</p>
      <p className="jcd-text jcd-muted">{jpoolBindPromptText(validatorName)}</p>
      <div className="jcd-actions">
        <button
          type="button"
          className="jcd-button jcd-primary"
          disabled={busy}
          aria-busy={busy}
          onClick={() => void bind()}
        >
          {status === 'signing'
            ? 'Confirm in wallet…'
            : status === 'submitting'
              ? 'Binding…'
              : 'Bind wallet'}
        </button>
        <button type="button" className="jcd-button" disabled={busy} onClick={onSkip}>
          Skip
        </button>
      </div>
    </div>
  )
}

function JcdStyles() {
  return (
    <style>{`
      [data-widget="deepstake"] .jcd-overlay {
        position: absolute;
        inset: 0;
        z-index: 100;
        background-color: #9f9facc4;
        backdrop-filter: blur(4px);
        border-radius: 20px;
      }
      [data-widget="deepstake"] .jcd-modal {
        position: absolute;
        z-index: 101;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        box-sizing: border-box;
        width: 400px;
        max-width: calc(100% - 32px);
        max-height: calc(100% - 40px);
        overflow-y: auto;
        padding: 50px 50px 30px;
        background-color: #fff;
        border-radius: 20px;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
        color: #000;
        text-align: center;
        outline: none;
      }
      [data-widget="deepstake"] .jcd-close {
        position: absolute;
        top: 15px;
        right: 15px;
        background: transparent;
        border: none;
        color: inherit;
        font-size: 28px;
        font-weight: 100;
        line-height: 1;
        padding: 4px 8px;
        cursor: pointer;
      }
      [data-widget="deepstake"] .jcd-title {
        margin: 0;
        font-size: 20px;
        font-weight: 600;
      }
      [data-widget="deepstake"] .jcd-logo { display: block; margin: 20px auto; }
      [data-widget="deepstake"] .jcd-text {
        margin: 0 0 10px;
        font-size: 13px;
        line-height: 1.45;
      }
      [data-widget="deepstake"] .jcd-muted { color: #777; }
      [data-widget="deepstake"] .jcd-here { color: #18864b; }
      [data-widget="deepstake"] .jcd-warn { color: #a76100; }
      [data-widget="deepstake"] .jcd-text a,
      [data-widget="deepstake"] .jcd-bind .jm-note a { color: inherit; text-decoration: underline; }
      [data-widget="deepstake"] .jcd-bind {
        margin: 16px 0 6px;
        padding-top: 14px;
        border-top: 1px solid #e5e4e4;
      }
      [data-widget="deepstake"] .jcd-bind-title {
        margin: 0 0 6px;
        font-size: 14px;
        font-weight: 600;
      }
      [data-widget="deepstake"] .jcd-bind .jm-note { font-size: 12px; color: #1a6fa8; }
      [data-widget="deepstake"] .jcd-actions {
        display: flex;
        justify-content: center;
        gap: 12px;
        margin-top: 8px;
      }
      [data-widget="deepstake"] .jcd-button {
        width: 120px;
        padding: 6px 0;
        border: 0;
        border-radius: 12px;
        background: #E5E4E4;
        color: #555;
        font: inherit;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
      }
      [data-widget="deepstake"] .jcd-primary { background: #5A5A62; color: #fff; }
      [data-widget="deepstake"] .jcd-button:disabled { opacity: 0.6; cursor: default; }
      [data-widget="deepstake"] .jcd-links {
        display: flex;
        justify-content: space-between;
        gap: 24px;
        margin-top: 20px;
      }

      [data-widget="deepstake"][data-theme="dark"] .jcd-overlay { background-color: #0d1625db; }
      [data-widget="deepstake"][data-theme="dark"] .jcd-modal {
        background-color: #353844;
        color: #fff;
      }
      [data-widget="deepstake"][data-theme="dark"] .jcd-muted { color: #9F9FAC; }
      [data-widget="deepstake"][data-theme="dark"] .jcd-here { color: #5fd38d; }
      [data-widget="deepstake"][data-theme="dark"] .jcd-warn { color: #f4b860; }
      [data-widget="deepstake"][data-theme="dark"] .jcd-bind { border-top-color: #5A5A62; }
      [data-widget="deepstake"][data-theme="dark"] .jcd-bind .jm-note { color: #6ab8f0; }
      [data-widget="deepstake"][data-theme="dark"] .jcd-button { background: #5A5A62; color: #9F9FAC; }
      [data-widget="deepstake"][data-theme="dark"] .jcd-primary { background: #D9D9D9; color: #000; }
      [data-widget="deepstake"][data-theme="dark"] .sol-links { color: #fff; }
    `}</style>
  )
}
