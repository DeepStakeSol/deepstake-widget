import { useCallback, useEffect, useRef, useState } from 'react'
import { UiWalletAccount } from '@wallet-standard/react'
import { useWalletAccountTransactionSigner } from '@solana/react'
import {
  getBase64EncodedWireTransaction,
  getBase64Encoder,
  getTransactionDecoder,
} from '@solana/kit'
import { getCurrentChain } from '../../utils/config'
import { StakeButtonBase } from './StakeButtonBase'
import { useStakingModal } from '../../context/StakingModalContext'
import { BackendRequestError } from '../../utils/backendRequest'
import {
  confirmTransaction,
  invalidateSolBalanceCache,
  sendSignedTransaction,
} from '../../utils/api'
import {
  directStakeKeys,
  fetchJpoolManage,
  generateJpoolStakeTransaction,
  getJpoolErrorText,
  hasNewDirectStake,
  JPOOL_REGISTRATION_POLL_DELAYS_MS,
  type JpoolManageResponse,
} from '../../utils/jpool'
import {
  jpoolSuccessMessage,
  type JpoolCompletion,
  type JpoolRegistration,
} from '../../utils/jpoolCopy'

interface Props {
  network: string
  account: UiWalletAccount
  voteAccount: string
  // Exact lamports from useLiquidStakeForm; null when nothing is stakeable.
  stakeLamports: bigint | null
  inSufficientBalance: boolean
  depositsPaused: boolean
  validatorName: string
  onManageLoaded: (data: JpoolManageResponse) => void
  onSuccess: () => void
}

// Wallet errors keep their own text; backend errors are shown by code only.
function toDisplayError(error: unknown): unknown {
  return error instanceof BackendRequestError ? new Error(getJpoolErrorText(error)) : error
}

export function StakeButtonJpool({
  network,
  account,
  voteAccount,
  stakeLamports,
  inSufficientBalance,
  depositsPaused,
  validatorName,
  onManageLoaded,
  onSuccess,
}: Props) {
  const { showSuccessModal, hideSuccessModal } = useStakingModal()
  const walletSigner = useWalletAccountTransactionSigner(account, getCurrentChain())

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [completed, setCompleted] = useState<JpoolCompletion | undefined>()
  const [currentError, setCurrentError] = useState<unknown>()
  const inFlight = useRef(false)
  // Bumped on every submit and on close, so late polls of an old run are dropped.
  const runId = useRef(0)
  const pollTimers = useRef<ReturnType<typeof setTimeout>[]>([])

  const stopPolling = useCallback(() => {
    pollTimers.current.forEach(clearTimeout)
    pollTimers.current = []
  }, [])

  useEffect(() => stopPolling, [stopPolling])

  const pollRegistration = useCallback(
    (run: number, before: Set<string> | null) => {
      let remaining = JPOOL_REGISTRATION_POLL_DELAYS_MS.length
      // A slow earlier poll must not overwrite the verdict of a later one.
      let done = false
      const finish = (registration: JpoolRegistration) => {
        done = true
        stopPolling()
        setCompleted((current) => (current ? { ...current, registration } : current))
      }
      pollTimers.current = JPOOL_REGISTRATION_POLL_DELAYS_MS.map((delay) =>
        setTimeout(async () => {
          let manage: JpoolManageResponse | null = null
          try {
            manage = await fetchJpoolManage(account.address, voteAccount, network, {
              refresh: true,
            })
          } catch (error) {
            console.error('JPool registration poll failed:', error)
          }
          if (runId.current !== run || done) return
          remaining -= 1
          if (manage) onManageLoaded(manage)
          if (before && manage && hasNewDirectStake(before, manage)) {
            finish('registered')
          } else if (remaining === 0) {
            finish(before ? 'not_yet' : 'unknown')
          }
        }, delay)
      )
    },
    [account.address, voteAccount, network, onManageLoaded, stopPolling]
  )

  const handleSubmit = useCallback(
    async (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
      if (inFlight.current || !stakeLamports || !walletSigner) return

      inFlight.current = true
      const run = ++runId.current
      stopPolling()
      setCurrentError(undefined)
      setCompleted(undefined)
      setIsSubmitting(true)

      try {
        // Records already known before this deposit; a new key after confirm
        // means JPool registered it.
        const baseline = fetchJpoolManage(account.address, voteAccount, network)
          .then(directStakeKeys)
          .catch(() => null)

        const { transaction, quote } = await generateJpoolStakeTransaction(network, {
          wallet: account.address,
          voteAccount,
          stakeLamports,
        })
        const decoded = getTransactionDecoder().decode(getBase64Encoder().encode(transaction))
        const [signed] = await walletSigner.modifyAndSignTransactions([decoded])

        let signature: string
        let sendError: BackendRequestError | undefined
        try {
          signature = await sendSignedTransaction(network, getBase64EncodedWireTransaction(signed))
        } catch (error) {
          // The bytes may still have landed: confirm the signature before
          // reporting a failure that invites a second deposit.
          if (
            error instanceof BackendRequestError &&
            error.code === 'TRANSACTION_SEND_FAILED' &&
            error.signature
          ) {
            signature = error.signature
            sendError = error
          } else {
            throw error
          }
        }

        try {
          await confirmTransaction(network, {
            txid: signature,
            targetCommitment: 'confirmed',
            timeout: 30000,
            interval: 1000,
            cacheMutation: { walletAddress: account.address, mutation: 'jpool-stake' },
          })
        } catch (error) {
          throw sendError ?? error
        }

        invalidateSolBalanceCache(account.address, network)
        if (runId.current !== run) return
        setCompleted({
          signature,
          expectedJsol: BigInt(quote.expectedJsol),
          registration: 'pending',
        })
        pollRegistration(run, await baseline)
      } catch (error) {
        console.error('JPool staking error:', error)
        if (runId.current === run) setCurrentError(toDisplayError(error))
      } finally {
        inFlight.current = false
        setIsSubmitting(false)
      }
    },
    [
      stakeLamports,
      walletSigner,
      account.address,
      voteAccount,
      network,
      stopPolling,
      pollRegistration,
    ]
  )

  const handleClose = useCallback(() => {
    runId.current += 1
    stopPolling()
    setCompleted(undefined)
    onSuccess()
  }, [onSuccess, stopPolling])

  useEffect(() => {
    if (completed) {
      showSuccessModal({
        title: 'Stake sent to JPool',
        message: jpoolSuccessMessage(completed, validatorName),
        signature: completed.signature,
        onClose: handleClose,
      })
    } else {
      hideSuccessModal()
    }
  }, [completed, validatorName, showSuccessModal, hideSuccessModal, handleClose])

  const hasAmount = stakeLamports !== null
  const label = isSubmitting
    ? 'Confirming Transaction'
    : depositsPaused
      ? 'Deposits paused'
      : inSufficientBalance
        ? 'Insufficient Balance'
        : !hasAmount
          ? 'Enter stake amount'
          : 'Stake'

  return (
    <StakeButtonBase
      buttonLabel={label}
      disableStakeButton={isSubmitting || depositsPaused || inSufficientBalance || !hasAmount}
      isSendingTransaction={isSubmitting}
      handleSubmit={handleSubmit}
      error={currentError}
    />
  )
}
