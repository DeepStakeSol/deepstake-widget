import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  useLiquidStakeFormMock: vi.fn(),
  fetchJpoolManageMock: vi.fn(),
  fetchJpoolPoolMock: vi.fn(),
  inputProps: vi.fn(),
  buttonProps: vi.fn(),
  manageProps: vi.fn(),
}))

vi.mock('@solana/webcrypto-ed25519-polyfill', () => ({ install: vi.fn() }))
vi.mock('@radix-ui/themes', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('../../hooks/useLiquidStakeForm', () => ({
  useLiquidStakeForm: mocks.useLiquidStakeFormMock,
}))
vi.mock('../../utils/jpool', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/jpool')>()),
  fetchJpoolManage: mocks.fetchJpoolManageMock,
  fetchJpoolPool: mocks.fetchJpoolPoolMock,
}))
vi.mock('../WalletConnectButton', () => ({
  WalletConnectButton: () => <button type="button">Connect Wallet</button>,
}))
vi.mock('./NoWalletTable', () => ({ NoWalletTable: () => <div>No Wallet Table</div> }))
vi.mock('./WalletInfo', () => ({
  WalletInfo: (props: { address?: string; showAmountButtons?: boolean }) => (
    <div data-testid="manage-wallet-row">
      {props.address}:{String(props.showAmountButtons)}
    </div>
  ),
}))
vi.mock('./StakeInputSection', () => ({
  StakeInputSection: (props: { stakeMode?: string; inputHint?: React.ReactNode }) => {
    mocks.inputProps(props)
    return (
      <div>
        Stake input {props.stakeMode}
        <span data-testid="input-hint">{props.inputHint}</span>
      </div>
    )
  },
}))
vi.mock('./StakeButtonJpool', () => ({
  StakeButtonJpool: (props: unknown) => {
    mocks.buttonProps(props)
    return <button type="button">JPool Stake Button</button>
  },
}))
vi.mock('./JpoolManageBlock', () => ({
  JpoolManageBlock: (props: { data: { uiStatus?: string } | null }) => {
    mocks.manageProps(props)
    return <div>JPool Manage {props.data?.uiStatus ?? 'none'}</div>
  },
}))
vi.mock('./StakeLayout', () => ({
  StakeLayout: ({
    stakeChildren,
    manageChildren,
    onManageOpen,
  }: {
    stakeChildren: React.ReactNode
    manageChildren: React.ReactNode
    onManageOpen?: () => void
  }) => (
    <div>
      <section>{stakeChildren}</section>
      <button type="button" onClick={onManageOpen}>
        Open Manage
      </button>
      <section>{manageChildren}</section>
    </div>
  ),
}))

import { StakeFormJpool } from './StakeFormJpool'

const VOTE = 'DeEpSdaw8uBLQ5T2HQhDf8fBSVbm13jGqJwoSF3HTpL5'
const POOL = {
  totalLamports: '1376600000',
  poolTokenSupply: '1000000000',
  solDepositFee: { denominator: '0', numerator: '0' },
  depositsRestricted: false,
  ataRentLamports: '1488440',
}

function mockForm(overrides = {}) {
  const form = {
    selectedWalletAccount: undefined,
    network: 'mainnet',
    isConnected: false,
    balance: 0,
    formattedStakeAmount: '',
    handleInputChange: vi.fn(),
    setHalf: vi.fn(),
    setMax: vi.fn(),
    stakeLamports: null,
    inSufficientBalance: false,
    resetFormAndRefreshBalance: vi.fn(),
    ...overrides,
  }
  mocks.useLiquidStakeFormMock.mockReturnValue(form)
  return form
}

function renderForm(validatorInfo: unknown = { name: 'DeepStake' }) {
  return render(
    <StakeFormJpool
      validatorInfo={validatorInfo as never}
      voteAccount={VOTE}
      secondsRemainToEpochEnd={100}
    />
  )
}

describe('StakeFormJpool', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset())
    mocks.fetchJpoolPoolMock.mockResolvedValue(POOL)
    mocks.fetchJpoolManageMock.mockResolvedValue({ uiStatus: 'bound_here', ataExists: false })
  })

  it('renders the mainnet-only state on devnet without fetching', () => {
    mockForm({ network: 'devnet' })
    renderForm()
    expect(screen.getByText('JPool only works in the mainnet cluster')).toBeInTheDocument()
    expect(mocks.fetchJpoolPoolMock).not.toHaveBeenCalled()
    expect(mocks.fetchJpoolManageMock).not.toHaveBeenCalled()
  })

  it('renders the disconnected state with the tagged-deposit copy', () => {
    mockForm()
    renderForm()
    expect(screen.getByText('Stake input jpool')).toBeInTheDocument()
    expect(screen.getAllByText('Connect Wallet')).toHaveLength(2)
    expect(screen.getByText('No Wallet Table')).toBeInTheDocument()
    expect(
      screen.getByText(/Your deposit is tagged for DeepStake via JPool direct staking\./)
    ).toBeInTheDocument()
    expect(mocks.fetchJpoolManageMock).not.toHaveBeenCalled()
  })

  it('wires the liquid Half/MAX handlers into the input section', () => {
    const form = mockForm()
    renderForm()
    expect(mocks.inputProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ onHalf: form.setHalf, onMax: form.setMax, stakeMode: 'jpool' })
    )
  })

  it('shows the ~JSOL quote from the pool', async () => {
    mockForm({ stakeLamports: BigInt(10_000_000) })
    renderForm()
    await waitFor(() =>
      expect(screen.getByTestId('input-hint')).toHaveTextContent('You receive ~0.007264 JSOL')
    )
    expect(mocks.fetchJpoolPoolMock).toHaveBeenCalledWith('mainnet')
  })

  it('shows no quote without an amount or when the pool is unavailable', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockForm({ stakeLamports: null })
    const { unmount } = renderForm()
    await waitFor(() => expect(mocks.fetchJpoolPoolMock).toHaveBeenCalled())
    expect(screen.getByTestId('input-hint')).toBeEmptyDOMElement()
    unmount()

    mocks.fetchJpoolPoolMock.mockRejectedValue(new Error('down'))
    mockForm({ stakeLamports: BigInt(10_000_000) })
    renderForm()
    await waitFor(() => expect(console.error).toHaveBeenCalled())
    expect(screen.getByTestId('input-hint')).toBeEmptyDOMElement()
  })

  it('shows paused deposits and disables the button', async () => {
    mocks.fetchJpoolPoolMock.mockResolvedValue({ ...POOL, depositsRestricted: true })
    mockForm({
      selectedWalletAccount: { address: 'wallet' },
      isConnected: true,
      stakeLamports: BigInt(10_000_000),
    })
    renderForm()
    await waitFor(() =>
      expect(screen.getByTestId('input-hint')).toHaveTextContent(
        'Deposits to JPool are paused right now. Please try again later.'
      )
    )
    expect(mocks.buttonProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ depositsPaused: true })
    )
  })

  it('loads Manage for a connected wallet, feeds ataExists to the hook and refetches on open', async () => {
    const form = mockForm({ selectedWalletAccount: { address: 'wallet' }, isConnected: true })
    renderForm()
    await waitFor(() => expect(screen.getByText('JPool Manage bound_here')).toBeInTheDocument())
    expect(mocks.fetchJpoolManageMock).toHaveBeenCalledWith('wallet', VOTE, 'mainnet', {
      refresh: false,
    })
    expect(mocks.useLiquidStakeFormMock).toHaveBeenLastCalledWith({
      ataExists: false,
      ataRentLamports: BigInt(1_488_440),
    })
    expect(mocks.buttonProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        voteAccount: VOTE,
        validatorName: 'DeepStake',
        onSuccess: form.resetFormAndRefreshBalance,
      })
    )

    await userEvent.click(screen.getByRole('button', { name: 'Open Manage' }))
    await waitFor(() => expect(mocks.fetchJpoolManageMock).toHaveBeenCalledTimes(2))
  })

  it('takes Manage data pushed by the stake button', async () => {
    mockForm({ selectedWalletAccount: { address: 'wallet' }, isConnected: true })
    renderForm()
    await waitFor(() => expect(screen.getByText('JPool Manage bound_here')).toBeInTheDocument())
    const { onManageLoaded } = mocks.buttonProps.mock.calls.at(-1)?.[0] as {
      onManageLoaded: (data: unknown) => void
    }
    const { act } = await import('@testing-library/react')
    act(() => onManageLoaded({ uiStatus: 'bound_elsewhere', ataExists: true }))
    expect(screen.getByText('JPool Manage bound_elsewhere')).toBeInTheDocument()
  })

  it('passes the wallet to Manage and takes Manage data pushed by the bind control', async () => {
    const account = { address: 'wallet' }
    mockForm({ selectedWalletAccount: account, isConnected: true })
    renderForm()
    await waitFor(() => expect(screen.getByText('JPool Manage bound_here')).toBeInTheDocument())
    const props = mocks.manageProps.mock.calls.at(-1)?.[0] as {
      account: unknown
      onManageLoaded: (data: unknown) => void
    }
    expect(props.account).toBe(account)
    const { act } = await import('@testing-library/react')
    act(() => props.onManageLoaded({ uiStatus: 'bound_here', ataExists: true, binding: null }))
    act(() => props.onManageLoaded({ uiStatus: 'not_bound', ataExists: true }))
    expect(screen.getByText('JPool Manage not_bound')).toBeInTheDocument()
  })

  it('names the validator by truncated vote without a profile', () => {
    mockForm()
    renderForm(null)
    expect(screen.getByText(/tagged for DeEpSd\.\.\.3HTpL5 via JPool/)).toBeInTheDocument()
  })

  it('shows the wallet row without Half/MAX and an overlay while Manage loads', async () => {
    let resolveManage!: (value: unknown) => void
    mocks.fetchJpoolManageMock.mockReturnValue(new Promise((resolve) => (resolveManage = resolve)))
    mockForm({ selectedWalletAccount: { address: 'wallet' }, isConnected: true })
    renderForm()

    expect(screen.getByTestId('manage-wallet-row')).toHaveTextContent('wallet:false')
    expect(await screen.findByRole('status', { name: 'Loading JPool data' })).toBeInTheDocument()
    expect(screen.queryByText(/JPool Manage/)).not.toBeInTheDocument()

    const { act } = await import('@testing-library/react')
    await act(async () => resolveManage({ uiStatus: 'not_bound', ataExists: true }))
    expect(screen.getByText('JPool Manage not_bound')).toBeInTheDocument()
    expect(screen.queryByRole('status', { name: 'Loading JPool data' })).not.toBeInTheDocument()
  })
})
