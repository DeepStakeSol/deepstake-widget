import type { ReactNode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { UiWalletAccount } from '@wallet-standard/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SelectedWalletAccountContext } from '../context/SelectedWalletAccountContext'

const {
  fetchSolBalanceMock,
  invalidateSolBalanceCacheMock,
  useIsWalletConnectedMock,
  useNetworkMock,
} = vi.hoisted(() => ({
  fetchSolBalanceMock: vi.fn(),
  invalidateSolBalanceCacheMock: vi.fn(),
  useIsWalletConnectedMock: vi.fn(),
  useNetworkMock: vi.fn(),
}))

vi.mock('../utils/api', () => ({
  fetchSolBalance: fetchSolBalanceMock,
  invalidateSolBalanceCache: invalidateSolBalanceCacheMock,
}))
vi.mock('./useIsWalletConnected', () => ({ useIsWalletConnected: useIsWalletConnectedMock }))
vi.mock('../context/NetworkContext', () => ({ useNetwork: useNetworkMock }))

import {
  FEE_RESERVE_LAMPORTS,
  normalizeSolInput,
  TOKEN_ACCOUNT_RENT_LAMPORTS,
  useLiquidStakeForm,
  type UseLiquidStakeFormOptions,
} from './useLiquidStakeForm'

const account = { address: 'wallet-a' } as UiWalletAccount
const otherAccount = { address: 'wallet-b' } as UiWalletAccount

function renderForm(
  selected: UiWalletAccount | undefined,
  options: UseLiquidStakeFormOptions = {}
) {
  let current = selected
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <SelectedWalletAccountContext.Provider value={[current, vi.fn()]}>
        {children}
      </SelectedWalletAccountContext.Provider>
    )
  }
  const view = renderHook((props: UseLiquidStakeFormOptions) => useLiquidStakeForm(props), {
    wrapper: Wrapper,
    initialProps: options,
  })
  return {
    ...view,
    switchAccount(next: UiWalletAccount | undefined) {
      current = next
      view.rerender(options)
    },
  }
}

describe('normalizeSolInput', () => {
  it.each([
    ['abc12,34.5678991234xyz', '12.345678991'],
    ['.5', '0.5'],
    ['007', '7'],
    ['00.5', '0.5'],
    ['0', '0'],
    ['1.', '1.'],
    ['1.2.3', '1.23'],
    ['', ''],
    ['abc', ''],
  ])('normalizes %j to %j', (input, expected) => {
    expect(normalizeSolInput(input)).toBe(expected)
  })
})

describe('useLiquidStakeForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchSolBalanceMock.mockResolvedValue(1)
    useIsWalletConnectedMock.mockReturnValue(true)
    useNetworkMock.mockReturnValue({ network: 'mainnet', setNetwork: vi.fn() })
  })

  it('does not fetch without a wallet', () => {
    const { result } = renderForm(undefined)
    expect(result.current.balanceLamports).toBeNull()
    expect(result.current.maxStakeLamports).toBe(BigInt(0))
    expect(fetchSolBalanceMock).not.toHaveBeenCalled()
  })

  it('loads the balance in exact lamports', async () => {
    fetchSolBalanceMock.mockResolvedValue(0.3)
    const { result } = renderForm(account)
    await waitFor(() => expect(result.current.balanceLamports).toBe(BigInt(300_000_000)))
    expect(result.current.balance).toBe(0.3)
    expect(fetchSolBalanceMock).toHaveBeenCalledWith('wallet-a', 'mainnet')
  })

  it('keeps 9-decimal input exact and exposes lamports', () => {
    const { result } = renderForm(account)
    act(() => result.current.handleInputChange('0.123456789'))
    expect(result.current.stakeAmount).toBe('0.123456789')
    expect(result.current.formattedStakeAmount).toBe('0.123456789')
    expect(result.current.stakeLamports).toBe(BigInt(123_456_789))

    act(() => result.current.handleInputChange('0'))
    expect(result.current.stakeLamports).toBeNull()
    act(() => result.current.handleInputChange(''))
    expect(result.current.stakeLamports).toBeNull()
  })

  it('reserves only the fee when the ATA exists or is unknown', async () => {
    for (const ataExists of [true, null, undefined]) {
      const { result, unmount } = renderForm(account, { ataExists })
      await waitFor(() => expect(result.current.balanceLamports).toBe(BigInt(1_000_000_000)))
      expect(result.current.reserveLamports).toBe(FEE_RESERVE_LAMPORTS)
      expect(result.current.maxStakeLamports).toBe(BigInt(1_000_000_000) - FEE_RESERVE_LAMPORTS)
      unmount()
    }
  })

  it('adds ATA rent only when the ATA is confirmed missing', async () => {
    const { result } = renderForm(account, { ataExists: false })
    await waitFor(() => expect(result.current.balanceLamports).toBe(BigInt(1_000_000_000)))
    expect(result.current.reserveLamports).toBe(FEE_RESERVE_LAMPORTS + TOKEN_ACCOUNT_RENT_LAMPORTS)
    expect(TOKEN_ACCOUNT_RENT_LAMPORTS).toBe(BigInt(2_039_280))
  })

  it('Max fills balance minus reserve', async () => {
    const { result } = renderForm(account, { ataExists: false })
    await waitFor(() => expect(result.current.balanceLamports).not.toBeNull())
    act(() => result.current.setMax())
    // 1 SOL - 0.001 fee reserve - 0.00203928 ATA rent
    expect(result.current.stakeAmount).toBe('0.99696072')
    expect(result.current.stakeLamports).toBe(result.current.maxStakeLamports)
    expect(result.current.inSufficientBalance).toBe(false)
  })

  it('Half fills half the balance', async () => {
    const { result } = renderForm(account)
    await waitFor(() => expect(result.current.balanceLamports).not.toBeNull())
    act(() => result.current.setHalf())
    expect(result.current.stakeAmount).toBe('0.5')
  })

  it('Half is capped by Max on a small balance', async () => {
    // 0.0015 SOL: half is 0.00075, but only 0.0005 is left after the reserve
    fetchSolBalanceMock.mockResolvedValue(0.0015)
    const { result } = renderForm(account)
    await waitFor(() => expect(result.current.balanceLamports).not.toBeNull())
    act(() => result.current.setHalf())
    expect(result.current.stakeAmount).toBe('0.0005')
  })

  it('Half and Max clear the input when nothing is stakeable', async () => {
    fetchSolBalanceMock.mockResolvedValue(0.0005)
    const { result } = renderForm(account)
    await waitFor(() => expect(result.current.balanceLamports).not.toBeNull())
    act(() => result.current.handleInputChange('1'))
    act(() => result.current.setMax())
    expect(result.current.stakeAmount).toBe('')
    act(() => result.current.handleInputChange('1'))
    act(() => result.current.setHalf())
    expect(result.current.stakeAmount).toBe('')
  })

  it('flags an amount above Max as insufficient, but only once the balance is known', async () => {
    let resolveBalance!: (sol: number) => void
    fetchSolBalanceMock.mockReturnValue(new Promise((resolve) => (resolveBalance = resolve)))
    const { result } = renderForm(account)
    act(() => result.current.handleInputChange('1'))
    expect(result.current.inSufficientBalance).toBe(false)

    await act(async () => resolveBalance(1))
    expect(result.current.inSufficientBalance).toBe(true)

    act(() => result.current.handleInputChange('0.999'))
    expect(result.current.inSufficientBalance).toBe(false)
    act(() => result.current.handleInputChange('0.999000001'))
    expect(result.current.inSufficientBalance).toBe(true)
  })

  it('drops a late balance from the previous wallet', async () => {
    let resolveFirst!: (sol: number) => void
    fetchSolBalanceMock
      .mockReturnValueOnce(new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce(2)
    const view = renderForm(account)

    view.switchAccount(otherAccount)
    await waitFor(() => expect(view.result.current.balance).toBe(2))
    await act(async () => resolveFirst(5))
    expect(view.result.current.balance).toBe(2)
    expect(fetchSolBalanceMock).toHaveBeenLastCalledWith('wallet-b', 'mainnet')
  })

  it('resets the balance when the wallet disconnects', async () => {
    const view = renderForm(account)
    await waitFor(() => expect(view.result.current.balance).toBe(1))
    view.switchAccount(undefined)
    expect(view.result.current.balance).toBe(0)
    expect(view.result.current.balanceLamports).toBeNull()
  })

  it('reset clears the input and refetches past the browser cache', async () => {
    const { result } = renderForm(account)
    await waitFor(() => expect(result.current.balance).toBe(1))
    fetchSolBalanceMock.mockClear().mockResolvedValue(0.5)

    act(() => result.current.handleInputChange('0.2'))
    await act(async () => result.current.resetFormAndRefreshBalance())

    expect(result.current.stakeAmount).toBe('')
    expect(invalidateSolBalanceCacheMock).toHaveBeenCalledWith('wallet-a', 'mainnet')
    await waitFor(() => expect(result.current.balance).toBe(0.5))
  })

  it('logs and keeps state when the balance request fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    fetchSolBalanceMock.mockRejectedValue(new Error('down'))
    const { result } = renderForm(account)
    await waitFor(() => expect(consoleError).toHaveBeenCalled())
    expect(result.current.balanceLamports).toBeNull()
  })
})
