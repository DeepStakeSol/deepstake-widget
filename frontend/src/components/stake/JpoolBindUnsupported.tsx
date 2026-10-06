import { jpoolDirectStakeUrl, type JpoolBindCapability } from '../../utils/jpool'

interface Props {
  voteAccount: string
  reason: Exclude<JpoolBindCapability, 'supported'>
}

// Shown instead of a Bind button when the wallet cannot sign the bind message
// (no solana:signMessage, or an off-curve account). Depositing still works.
export function JpoolBindUnsupported({ voteAccount, reason }: Props) {
  return (
    <p className="jm-note jm-hint" data-reason={reason}>
      Your wallet does not support message signing. You can bind it at{' '}
      <a href={jpoolDirectStakeUrl(voteAccount)} target="_blank" rel="noopener noreferrer">
        app.jpool.one
      </a>
      .
    </p>
  )
}
