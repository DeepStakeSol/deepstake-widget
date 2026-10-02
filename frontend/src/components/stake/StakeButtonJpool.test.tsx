import { act, fireEvent, render, screen } from '@testing-library/react'
import type { UiWalletAccount } from '@wallet-standard/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BackendRequestError } from '../../utils/backendRequest'
import type { JpoolManageResponse } from '../../utils/jpool'

const mocks = vi.hoisted(() => ({
  signMock: vi.fn(),
  generateMock: vi.fn(),
  manageMock: vi.fn(),
  sendMock: vi.fn(),
  confirmMock: vi.fn(),
  invalidateMock: vi.fn(),
  showSuccessModal: vi.fn(),
  hideSuccessModal: vi.fn(),
}))

vi.mock('@solana/react', () => ({
  useWalletAccountTransactionSigner: () => ({ modifyAndSignTransactions: mocks.signMock }),
}))
vi.mock('@solana/kit', () => ({
  getBase64Encoder: () => ({ encode: (value: string) => `bytes(${value})` }),
  getTransactionDecoder: () => ({ decode: (bytes: string) => `decoded(${bytes})` }),
  getBase64EncodedWireTransaction: (tx: string) => `wire(${tx})`,
}))
vi.mock('../../utils/config', () => ({ getCurrentChain: () => 'solana:mainnet' }))
vi.mock('../../context/StakingModalContext', () => ({
  useStakingModal: () => ({
    showSuccessModal: mocks.showSuccessModal,
    hideSuccessModal: mocks.hideSuccessModal,
  }),
}))
vi.mock('../../utils/api', () => ({
  confirmTransaction: mocks.confirmMock,
  invalidateSolBalanceCache: mocks.invalidateMock,
  sendSignedTransaction: mocks.sendMock,
}))
vi.mock('../../utils/jpool', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/jpool')>()),
  fetchJpoolManage: mocks.manageMock,
  generateJpoolStakeTransaction: mocks.generateMock,
}))
vi.mock('./StakeButtonBase', () => ({
  StakeButtonBase: ({
    buttonLabel,
    disableStakeButton,
    handleSubmit,
    error,
  }: {
    buttonLabel: string
    disableStakeButton: boolean
    handleSubmit: (event: React.MouseEvent<HTMLButtonElement>) => void
    error?: unknown
  }) => (
    <div>
      <button type="button" disabled={disableStakeButton} onClick={handleSubmit}>
        {buttonLabel}
      </button>
      {error instanceof Error && <p role="alert">{error.message}</p>}
    </div>
  ),
}))

import { StakeButtonJpool } from './StakeButtonJpool'

const WALLET = 'wallet-address'
const VOTE = 'DeEpSdaw8uBLQ5T2HQhDf8fBSVbm13jGqJwoSF3HTpL5'

function manageWith(ids: string[] | null): JpoolManageResponse {
  return {
    directStakes:
      ids &&
      ids.map((id) => ({
        id,
        voteId: VOTE,
        poolTokenAmount: '1',
        balanceAmount: '1',
        availableAmount: '1',
        createdAt: null,
      })),
  } as JpoolManageResponse
}

function renderButton(props: Partial<Parameters<typeof StakeButtonJpool>[0]> = {}) {
  const onManageLoaded = vi.fn()
  const onSuccess = vi.fn()
  const view = render(
    <StakeButtonJpool
      network="mainnet"
      account={{ address: WALLET } as UiWalletAccount}
      voteAccount={VOTE}
      stakeLamports={BigInt(10_000_000)}
      inSufficientBalance={false}
      depositsPaused={false}
      validatorName="DeepStake"
      onManageLoaded={onManageLoaded}
      onSuccess={onSuccess}
      {...props}
    />
  )
  return { ...view, onManageLoaded, onSuccess }
}

async function clickStake() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Stake' }))
  })
}

function lastSuccess() {
  return mocks.showSuccessModal.mock.calls.at(-1)?.[0] as {
    title: string
    message: string
    signature: string
    onClose: () => void
  }
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

describe('StakeButtonJpool', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    Object.values(mocks).forEach((mock) => mock.mockReset())
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.generateMock.mockResolvedValue({
      transaction: 'unsigned',
      quote: { expectedJsol: '7264274' },
    })
    mocks.signMock.mockResolvedValue(['signed'])
    mocks.sendMock.mockResolvedValue('sig-1')
    mocks.confirmMock.mockResolvedValue(undefined)
    mocks.manageMock.mockResolvedValue(manageWith(['1']))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it.each([
    [{ stakeLamports: null }, 'Enter stake amount'],
    [{ inSufficientBalance: true }, 'Insufficient Balance'],
    [{ depositsPaused: true }, 'Deposits paused'],
  ])('disables the button for %j', (props, label) => {
    renderButton(props)
    expect(screen.getByRole('button', { name: label })).toBeDisabled()
  })

  it('generates, signs, relays and confirms with the jpool-stake mutation', async () => {
    renderButton()
    await clickStake()

    expect(mocks.generateMock).toHaveBeenCalledWith('mainnet', {
      wallet: WALLET,
      voteAccount: VOTE,
      stakeLamports: BigInt(10_000_000),
    })
    expect(mocks.signMock).toHaveBeenCalledWith(['decoded(bytes(unsigned))'])
    expect(mocks.sendMock).toHaveBeenCalledWith('mainnet', 'wire(signed)')
    expect(mocks.confirmMock).toHaveBeenCalledWith('mainnet', {
      txid: 'sig-1',
      targetCommitment: 'confirmed',
      timeout: 30000,
      interval: 1000,
      cacheMutation: { walletAddress: WALLET, mutation: 'jpool-stake' },
    })
    expect(mocks.invalidateMock).toHaveBeenCalledWith(WALLET, 'mainnet')

    const success = lastSuccess()
    expect(success.title).toBe('Stake sent to JPool')
    expect(success.signature).toBe('sig-1')
    expect(success.message).toBe(
      'You received ~0.007264 JSOL. Your deposit is tagged for DeepStake via JPool direct staking. JPool usually registers a deposit within 5 minutes. Checking…'
    )
  })

  it('polls Manage at 15 s, 1, 3 and 5.5 min and stops once a new record appears', async () => {
    const { onManageLoaded } = renderButton()
    await clickStake()
    // the baseline read before the deposit
    expect(mocks.manageMock).toHaveBeenCalledTimes(1)
    mocks.manageMock
      .mockResolvedValueOnce(manageWith(['1']))
      .mockResolvedValueOnce(manageWith(['1', '2']))

    await advance(14_999)
    expect(mocks.manageMock).toHaveBeenCalledTimes(1)
    await advance(1)
    expect(mocks.manageMock).toHaveBeenCalledTimes(2)
    expect(mocks.manageMock).toHaveBeenLastCalledWith(WALLET, VOTE, 'mainnet', { refresh: true })
    expect(lastSuccess().message).toContain(
      'JPool usually registers a deposit within 5 minutes. Checking…'
    )

    await advance(45_000)
    expect(mocks.manageMock).toHaveBeenCalledTimes(3)
    expect(onManageLoaded).toHaveBeenCalledTimes(2)
    expect(lastSuccess().message).toContain('JPool has registered this deposit for DeepStake.')

    await advance(300_000)
    expect(mocks.manageMock).toHaveBeenCalledTimes(3)
  })

  it('reports not-yet-registered after the last poll', async () => {
    renderButton()
    await clickStake()
    await advance(329_999)
    expect(mocks.manageMock).toHaveBeenCalledTimes(4)
    expect(lastSuccess().message).toContain(
      'JPool usually registers a deposit within 5 minutes. Checking…'
    )
    await advance(1)
    expect(mocks.manageMock).toHaveBeenCalledTimes(5)
    expect(lastSuccess().message).toContain(
      "JPool hasn't registered this deposit yet. It will appear on the Manage tab within a few minutes."
    )
  })

  it('cannot tell registration without a baseline', async () => {
    mocks.manageMock.mockResolvedValueOnce(manageWith(null))
    renderButton()
    await clickStake()
    mocks.manageMock.mockResolvedValue(manageWith(['1', '2']))
    await advance(330_000)
    expect(lastSuccess().message).toContain(
      'Check the Manage tab shortly to see this deposit counted for DeepStake.'
    )
  })

  it('keeps polling through failed polls', async () => {
    renderButton()
    await clickStake()
    mocks.manageMock
      .mockRejectedValueOnce(new Error('down'))
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce(manageWith(['1', '2']))
    await advance(330_000)
    expect(lastSuccess().message).toContain('JPool has registered this deposit')
  })

  it('stops polling and resets the form on close', async () => {
    const { onSuccess } = renderButton()
    await clickStake()
    await act(async () => lastSuccess().onClose())
    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(mocks.hideSuccessModal).toHaveBeenCalled()
    await advance(330_000)
    expect(mocks.manageMock).toHaveBeenCalledTimes(1)
  })

  it('confirms the returned signature when the relay fails after sending', async () => {
    mocks.sendMock.mockRejectedValue(
      new BackendRequestError('send failed', {
        status: 502,
        code: 'TRANSACTION_SEND_FAILED',
        signature: 'sig-maybe',
      })
    )
    renderButton()
    await clickStake()
    expect(mocks.confirmMock).toHaveBeenCalledWith(
      'mainnet',
      expect.objectContaining({ txid: 'sig-maybe' })
    )
    expect(lastSuccess().signature).toBe('sig-maybe')
  })

  it('reports the send failure when that signature does not confirm', async () => {
    mocks.sendMock.mockRejectedValue(
      new BackendRequestError('send failed', {
        status: 502,
        code: 'TRANSACTION_SEND_FAILED',
        signature: 'sig-maybe',
      })
    )
    mocks.confirmMock.mockRejectedValue(new Error('timeout'))
    renderButton()
    await clickStake()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The transaction could not be confirmed as sent. Check your wallet activity before trying again.'
    )
    expect(mocks.showSuccessModal).not.toHaveBeenCalled()
  })

  it('maps backend error codes to JPool texts', async () => {
    mocks.generateMock.mockRejectedValue(
      new BackendRequestError('x', { status: 503, code: 'JPOOL_POOL_UPDATING' })
    )
    renderButton()
    await clickStake()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'JPool is updating for the new epoch. Please try again in a few minutes.'
    )
    expect(mocks.signMock).not.toHaveBeenCalled()
  })

  it('keeps the wallet error text and clears it on the next attempt', async () => {
    mocks.signMock.mockRejectedValueOnce(new Error('User rejected the request.'))
    renderButton()
    await clickStake()
    expect(screen.getByRole('alert')).toHaveTextContent('User rejected the request.')
    expect(mocks.sendMock).not.toHaveBeenCalled()

    await clickStake()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(lastSuccess().signature).toBe('sig-1')
  })

  it('ignores a second click while submitting', async () => {
    let resolveGenerate!: (value: unknown) => void
    mocks.generateMock.mockReturnValue(new Promise((resolve) => (resolveGenerate = resolve)))
    renderButton()
    const button = screen.getByRole('button', { name: 'Stake' })
    await act(async () => {
      fireEvent.click(button)
      fireEvent.click(button)
    })
    expect(screen.getByRole('button', { name: 'Confirming Transaction' })).toBeDisabled()
    await act(async () =>
      resolveGenerate({ transaction: 'unsigned', quote: { expectedJsol: '1' } })
    )
    expect(mocks.generateMock).toHaveBeenCalledTimes(1)
    expect(mocks.sendMock).toHaveBeenCalledTimes(1)
  })
})
