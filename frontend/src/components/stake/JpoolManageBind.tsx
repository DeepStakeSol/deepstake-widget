import type { UiWalletAccount } from '@wallet-standard/react'
import { useJpoolBind } from '../../hooks/useJpoolBind'
import {
  getJpoolBindCapability,
  manageBindErrorText,
  type JpoolManageResponse,
} from '../../utils/jpool'
import { JpoolBindUnsupported } from './JpoolBindUnsupported'

interface Props {
  account: UiWalletAccount
  data: JpoolManageResponse | null
  network: string
  voteAccount: string
  validatorName: string
  onManageLoaded?: (manage: JpoolManageResponse) => void
}

// Manage Bind control (J2-3). Offered only for a confirmed `not_bound`
// binding (issue #20); there is no re-bind (TEMP-18). The capability check
// picks the component, so useJpoolBind is never called conditionally.
export function JpoolManageBind(props: Props) {
  const capability = getJpoolBindCapability(props.account)
  if (capability === 'supported') return <JpoolManageBindAction {...props} />
  // Also for wallets that cannot sign: they may have bound in the JPool app.
  if (props.data?.uiStatus === 'bound_here') return <BoundLine validatorName={props.validatorName} />
  if (props.data?.uiStatus !== 'not_bound') return null
  return <JpoolBindUnsupported voteAccount={props.voteAccount} reason={capability} />
}

function JpoolManageBindAction({
  account,
  data,
  network,
  voteAccount,
  validatorName,
  onManageLoaded,
}: Props) {
  const { status, result, error, bind } = useJpoolBind({
    account,
    voteAccount,
    network,
    onManageLoaded,
  })

  if (status === 'success') {
    const alreadyBound = result !== null && 'alreadyBound' in result && result.alreadyBound
    return <BoundLine validatorName={validatorName} alreadyBound={alreadyBound} />
  }

  // Persistent state, e.g. after a reload: the same line as right after binding.
  if (data?.uiStatus === 'bound_here') return <BoundLine validatorName={validatorName} />
  if (data?.uiStatus !== 'not_bound') return null

  const busy = status === 'signing' || status === 'submitting'
  const label =
    status === 'signing' ? 'Confirm in wallet…' : status === 'submitting' ? 'Binding…' : 'Bind wallet'

  return (
    <div className="jm-bind">
      <div className="jm-bind-row">
        <button
          type="button"
          className="jm-bind-button"
          disabled={busy}
          aria-busy={busy}
          onClick={() => void bind()}
        >
          {label}
        </button>
        <span
          className="jm-tooltip"
          data-tooltip={`Binding makes all JSOL in this wallet, now and in the future, count for ${validatorName}. Your wallet will ask you to sign a short message. Nothing is spent.`}
        />
      </div>
      {status === 'rejected' && <p className="jm-note jm-muted">Signature request declined.</p>}
      {status === 'error' && error && (
        <p className="jm-note jm-warn" role="alert">
          {manageBindErrorText(error)}
        </p>
      )}
    </div>
  )
}

function BoundLine({
  validatorName,
  alreadyBound = false,
}: {
  validatorName: string
  alreadyBound?: boolean
}) {
  return (
    <p className="jm-bind-status jm-tone-here" role="status">
      {alreadyBound ? 'Wallet already bound to' : 'Wallet bound to'} {validatorName}.
    </p>
  )
}
