import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VaultManageResponse } from '../../utils/api'
import type { ValidatorProfile } from '../../utils/solana/validator'
import { VaultBindingBlock } from './VaultBindingBlock'

const { fetchValidatorProfileMock } = vi.hoisted(() => ({
  fetchValidatorProfileMock: vi.fn(),
}))

vi.mock('../../utils/solana/validator', () => ({
  fetchValidatorProfile: fetchValidatorProfileMock,
}))

const WIDGET_VOTE = 'Vote111111111111111111111111111111111111111'
const OTHER_VOTE = 'Fhks5g1234567890123456789012345678909V6bub'

const widgetProfile = {
  voteAccount: WIDGET_VOTE,
  network: 'mainnet',
  name: 'DeepStake',
} as ValidatorProfile

const baseData: VaultManageResponse = {
  wallet: 'wallet',
  binding: {
    hasBinding: true,
    validatorVoteKey: WIDGET_VOTE,
  },
  balance: { vsol: '80000000' },
  stakebot: {
    found: true,
    generatedStake: '255.80620091343082',
  },
  uiStatus: 'ready',
}

function renderBlock(
  data: VaultManageResponse = baseData,
  validatorInfo: ValidatorProfile | null = widgetProfile,
) {
  return render(
    <VaultBindingBlock
      data={data}
      isLoading={false}
      network="mainnet"
      validatorInfo={validatorInfo}
      widgetVoteAccount={WIDGET_VOTE}
    />,
  )
}

describe('VaultBindingBlock', () => {
  beforeEach(() => {
    fetchValidatorProfileMock.mockReset()
  })

  it('shows generated stake in SOL separately from the wallet vSOL balance', () => {
    const { container } = renderBlock()

    expect(screen.getByText('255.806201 SOL')).toBeInTheDocument()
    expect(screen.getByText('0.080000 vSOL')).toBeInTheDocument()
    expect(container.querySelector('.q-mark-icon')).toHaveAttribute(
      'data-tooltip',
      'Including all possible strategies.',
    )
  })

  it('shows the current widget validator in the success state without another lookup', () => {
    renderBlock()

    expect(screen.getByText('DeepStake')).toHaveClass('vb-validator-success')
    expect(screen.queryByText(/currently goes to another validator/)).not.toBeInTheDocument()
    expect(fetchValidatorProfileMock).not.toHaveBeenCalled()
  })

  it('resolves and warns about another bound validator', async () => {
    fetchValidatorProfileMock.mockResolvedValue({
      ...widgetProfile,
      voteAccount: OTHER_VOTE,
      name: 'CryptoVik',
    })
    renderBlock({
      ...baseData,
      binding: { hasBinding: true, validatorVoteKey: OTHER_VOTE },
    })

    expect(await screen.findByText('CryptoVik')).toHaveClass('vb-validator-warning')
    expect(
      screen.getByText(
        'Your Vault direct stake currently goes to another validator. Staking here will re-bind it to DeepStake.',
      ),
    ).toBeInTheDocument()
    expect(fetchValidatorProfileMock).toHaveBeenCalledWith(OTHER_VOTE, 'mainnet')
  })

  it('falls back to the shortened key when the other validator has no name', async () => {
    fetchValidatorProfileMock.mockResolvedValue({
      ...widgetProfile,
      voteAccount: OTHER_VOTE,
      name: null,
    })
    renderBlock({
      ...baseData,
      binding: { hasBinding: true, validatorVoteKey: OTHER_VOTE },
    })

    expect(await screen.findByText('Fhks5g...9V6bub')).toHaveClass('vb-validator-warning')
  })

  it('falls back to the shortened key when profile lookup fails', async () => {
    fetchValidatorProfileMock.mockRejectedValue(new Error('unavailable'))
    renderBlock({
      ...baseData,
      binding: { hasBinding: true, validatorVoteKey: OTHER_VOTE },
    })

    await waitFor(() => {
      expect(fetchValidatorProfileMock).toHaveBeenCalledWith(OTHER_VOTE, 'mainnet')
    })
    expect(screen.getByText('Fhks5g...9V6bub')).toHaveClass('vb-validator-warning')
  })

  it('ignores a stale name response after the binding changes', async () => {
    const firstVote = 'First11111111111111111111111111111111111111'
    const secondVote = 'Second1111111111111111111111111111111111111'
    const resolvers = new Map<string, (profile: ValidatorProfile) => void>()
    fetchValidatorProfileMock.mockImplementation(
      (voteAccount: string) =>
        new Promise<ValidatorProfile>((resolve) => {
          resolvers.set(voteAccount, resolve)
        }),
    )

    const { rerender } = renderBlock({
      ...baseData,
      binding: { hasBinding: true, validatorVoteKey: firstVote },
    })
    await waitFor(() => expect(resolvers.has(firstVote)).toBe(true))

    rerender(
      <VaultBindingBlock
        data={{
          ...baseData,
          binding: { hasBinding: true, validatorVoteKey: secondVote },
        }}
        isLoading={false}
        network="mainnet"
        validatorInfo={widgetProfile}
        widgetVoteAccount={WIDGET_VOTE}
      />,
    )
    await waitFor(() => expect(resolvers.has(secondVote)).toBe(true))

    await act(async () => {
      resolvers.get(secondVote)?.({
        ...widgetProfile,
        voteAccount: secondVote,
        name: 'Current validator',
      })
    })
    expect(await screen.findByText('Current validator')).toBeInTheDocument()

    await act(async () => {
      resolvers.get(firstVote)?.({
        ...widgetProfile,
        voteAccount: firstVote,
        name: 'Stale validator',
      })
    })
    expect(screen.queryByText('Stale validator')).not.toBeInTheDocument()
    expect(screen.getByText('Current validator')).toBeInTheDocument()
  })

  it('shows the updating message when stakebot data is pending', () => {
    renderBlock({
      ...baseData,
      stakebot: { found: false },
      balance: { vsol: '2000000000' },
      uiStatus: 'updating',
    })

    expect(
      screen.getByText(
        'The data is updated every few hours, wait until the Vault stakebot does its job.',
      ),
    ).toBeInTheDocument()
  })

  it('shows the corrected low-balance message', () => {
    renderBlock({
      ...baseData,
      stakebot: { found: false },
      uiStatus: 'low_balance',
    })

    expect(screen.getByText(/because it doesn't get stake from you/)).toBeInTheDocument()
    expect(screen.queryByText(/because it don't get stake from you/)).not.toBeInTheDocument()
  })

  it('leaves Summary stake empty when the wallet has no binding', () => {
    const { container } = renderBlock({
      ...baseData,
      binding: { hasBinding: false },
      stakebot: { found: false },
      uiStatus: 'no_binding',
    })

    expect(container.querySelector('.vb-cell-right')).toBeEmptyDOMElement()
    expect(screen.getByText('0.080000 vSOL')).toBeInTheDocument()
  })
})
