import { render, screen } from '@testing-library/react'
import type { UiWalletAccount } from '@wallet-standard/react'
import { describe, expect, it, vi } from 'vitest'
import type { GetStakeAccountResponse } from '../../utils/solana/stake/get-stake-accounts'

vi.mock('./UnstakeButton', () => ({
  UnstakeButton: ({ isDisabled }: { isDisabled: boolean }) => (
    <button type="button" data-testid="unstake" disabled={isDisabled}>
      Unstake
    </button>
  ),
}))

vi.mock('./WithdrawButton', () => ({
  WithdrawButton: ({ isDisabled }: { isDisabled: boolean }) => (
    <button type="button" data-testid="withdraw" disabled={isDisabled}>
      Withdraw
    </button>
  ),
}))

import { StakeAccountsTable } from './StakeAccountsTable'

const U64_MAX_AS_NUMBER = Number(18446744073709551615n)

function stakeAccount(overrides: Partial<GetStakeAccountResponse> = {}): GetStakeAccountResponse {
  return {
    address: 'StakeAccount111111111111111111111111111111',
    solBalance: 10,
    owner: 'Owner11111111111111111111111111111111111',
    state: 2,
    activationEpoch: 99,
    deactivationEpoch: U64_MAX_AS_NUMBER,
    voter: 'Vote111111111111111111111111111111111111',
    ...overrides,
  } as GetStakeAccountResponse
}

function renderTable({
  row = stakeAccount(),
  currentEpoch = 100,
  selected = true,
}: {
  row?: GetStakeAccountResponse
  currentEpoch?: number
  selected?: boolean
} = {}) {
  const onSelectRow = vi.fn()
  const result = render(
    <div data-widget="deepstake" data-theme="light">
      <StakeAccountsTable
        network="mainnet"
        stakeAccounts={[row]}
        selectedRow={selected ? row : null}
        onSelectRow={onSelectRow}
        currentEpoch={currentEpoch}
        account={{} as UiWalletAccount}
        onSuccess={vi.fn()}
      />
    </div>
  )

  return { ...result, onSelectRow }
}

describe('StakeAccountsTable', () => {
  it('makes a stake activated and deactivated in the same epoch withdrawable', () => {
    renderTable({
      row: stakeAccount({ activationEpoch: 100, deactivationEpoch: 100 }),
    })

    expect(screen.getByText('deactivated')).toBeInTheDocument()
    expect(screen.getByTestId('unstake')).toBeDisabled()
    expect(screen.getByTestId('withdraw')).toBeEnabled()
  })

  it('allows an activating stake to be unstaked', () => {
    renderTable({
      row: stakeAccount({
        activationEpoch: 100,
        deactivationEpoch: U64_MAX_AS_NUMBER,
      }),
    })

    expect(screen.getByText('activating')).toBeInTheDocument()
    expect(screen.getByTestId('unstake')).toBeEnabled()
    expect(screen.getByTestId('withdraw')).toBeDisabled()
  })

  it('keeps an active stake eligible for unstaking', () => {
    renderTable()

    expect(screen.getByText('active')).toBeInTheDocument()
    expect(screen.getByTestId('unstake')).toBeEnabled()
    expect(screen.getByTestId('withdraw')).toBeDisabled()
  })

  it('uses the short deactivating status during the deactivation epoch', () => {
    renderTable({
      row: stakeAccount({ activationEpoch: 99, deactivationEpoch: 100 }),
    })

    const badge = screen.getByText('deactivating')
    expect(badge).toHaveClass('epoch-status')
    expect(screen.queryByText('pending deactivation')).not.toBeInTheDocument()
    expect(screen.getByTestId('unstake')).toBeDisabled()
    expect(screen.getByTestId('withdraw')).toBeDisabled()
  })

  it('allows a fully deactivated stake to be withdrawn', () => {
    renderTable({
      row: stakeAccount({ activationEpoch: 90, deactivationEpoch: 99 }),
    })

    expect(screen.getByText('deactivated')).toBeInTheDocument()
    expect(screen.getByTestId('unstake')).toBeDisabled()
    expect(screen.getByTestId('withdraw')).toBeEnabled()
  })

  it('only treats the actual u64 max sentinel as an unset deactivation epoch', () => {
    renderTable({
      row: stakeAccount({ activationEpoch: 90, deactivationEpoch: 1_844_600 }),
    })

    expect(screen.getByText('deactivated')).toBeInTheDocument()
    expect(screen.getByTestId('withdraw')).toBeEnabled()
  })

  it('marks the selected row and exposes a visible custom radio', () => {
    const row = stakeAccount()
    const { container } = renderTable({ row })

    const radio = screen.getByRole('radio', {
      name: `Select stake account ${row.address}`,
    })
    expect(radio).toBeChecked()
    expect(radio).toHaveClass('stake-row-radio')
    expect(radio.closest('tr')).toHaveClass('table-row-selected')

    const styles = Array.from(container.querySelectorAll('style'))
      .map((style) => style.textContent)
      .join('\n')
    expect(styles).toContain('white-space: nowrap')
    expect(styles).toContain('.table-row-selected > td')
    expect(styles).toContain('[data-theme="dark"] .table-row-selected > td')
  })
})
