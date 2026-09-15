import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { VaultManageResponse } from '../../utils/api'
import { VaultBindingBlock } from './VaultBindingBlock'

const baseData: VaultManageResponse = {
  wallet: 'wallet',
  binding: {
    hasBinding: true,
    validatorVoteKey: 'Vote111111111111111111111111111111111111111',
  },
  balance: { vsol: '80000000' },
  stakebot: {
    found: true,
    generatedStake: '255.80620091343082',
  },
  uiStatus: 'ready',
}

describe('VaultBindingBlock', () => {
  it('shows generated stake in SOL separately from the wallet vSOL balance', () => {
    const { container } = render(
      <VaultBindingBlock data={baseData} isLoading={false} />,
    )

    expect(screen.getByText('255.806201 SOL')).toBeInTheDocument()
    expect(screen.getByText('0.080000 vSOL')).toBeInTheDocument()
    expect(container.querySelector('.q-mark-icon')).toHaveAttribute(
      'data-tooltip',
      'Including all possible strategies.',
    )
  })

  it('shows the updating message when stakebot data is pending', () => {
    render(
      <VaultBindingBlock
        data={{
          ...baseData,
          stakebot: { found: false },
          balance: { vsol: '2000000000' },
          uiStatus: 'updating',
        }}
        isLoading={false}
      />,
    )

    expect(
      screen.getByText(
        'The data is updated every few hours, wait until the Vault stakebot does its job.',
      ),
    ).toBeInTheDocument()
  })

  it('shows the corrected low-balance message', () => {
    render(
      <VaultBindingBlock
        data={{
          ...baseData,
          stakebot: { found: false },
          uiStatus: 'low_balance',
        }}
        isLoading={false}
      />,
    )

    expect(screen.getByText(/because it doesn't get stake from you/)).toBeInTheDocument()
    expect(screen.queryByText(/because it don't get stake from you/)).not.toBeInTheDocument()
  })

  it('leaves Summary stake empty when the wallet has no binding', () => {
    const { container } = render(
      <VaultBindingBlock
        data={{
          ...baseData,
          binding: { hasBinding: false },
          stakebot: { found: false },
          uiStatus: 'no_binding',
        }}
        isLoading={false}
      />,
    )

    expect(container.querySelector('.vb-cell-right')).toBeEmptyDOMElement()
    expect(screen.getByText('0.080000 vSOL')).toBeInTheDocument()
  })
})
