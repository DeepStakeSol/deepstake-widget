import { render, screen, waitFor } from '@testing-library/react'
import type { UiWalletAccount } from '@wallet-standard/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { JpoolManageResponse } from '../../utils/jpool'
import type { ValidatorProfile } from '../../utils/solana/validator'
import { JpoolManageBlock } from './JpoolManageBlock'

const { fetchValidatorProfileMock } = vi.hoisted(() => ({ fetchValidatorProfileMock: vi.fn() }))
vi.mock('../../utils/solana/validator', () => ({
  fetchValidatorProfile: fetchValidatorProfileMock,
}))

const WIDGET_VOTE = 'DeEpSdaw8uBLQ5T2HQhDf8fBSVbm13jGqJwoSF3HTpL5'
const OTHER_VOTE = 'Vote111111111111111111111111111111111111111'
const UNAVAILABLE =
  'JPool data is temporarily unavailable. Your balance is shown; binding details will appear when JPool is back.'

const profile = { voteAccount: WIDGET_VOTE, name: 'DeepStake' } as ValidatorProfile

function manage(overrides: Partial<JpoolManageResponse> = {}): JpoolManageResponse {
  return {
    wallet: 'wallet',
    network: 'mainnet',
    voteAccount: WIDGET_VOTE,
    walletAtaBalance: '7264213',
    ataExists: true,
    portfolioBalance: null,
    // 1 JSOL = 1.3766 SOL
    poolRate: { totalLamports: '1376600000', poolTokenSupply: '1000000000' },
    binding: { voteId: WIDGET_VOTE, amount: '0', updatedAt: null },
    directStakes: [
      {
        id: '842',
        voteId: WIDGET_VOTE,
        poolTokenAmount: '7264213',
        balanceAmount: '7264213',
        availableAmount: '7264213',
        createdAt: null,
      },
    ],
    countedForValidator: '7264213',
    sources: { wallet: 'ok', pool: 'ok', binding: 'ok', directStakes: 'ok' },
    uiStatus: 'bound_here',
    ...overrides,
  }
}

function renderBlock(
  data: JpoolManageResponse | null,
  validatorInfo: ValidatorProfile | null = profile
) {
  return render(
    <JpoolManageBlock
      data={data}
      network="mainnet"
      validatorInfo={validatorInfo}
      widgetVoteAccount={WIDGET_VOTE}
    />
  )
}

function valueUnder(label: string) {
  return screen.getByText(label).nextElementSibling
}

describe('JpoolManageBlock', () => {
  beforeEach(() => {
    fetchValidatorProfileMock.mockReset().mockResolvedValue({ name: 'Other Validator' })
  })

  it('shows the design layout for a wallet staked to this validator', () => {
    renderBlock(manage())
    const stakedTo = valueUnder('Staked to:')
    expect(stakedTo).toHaveTextContent('DeepStake')
    expect(stakedTo).toHaveClass('jm-validator', 'jm-tone-here')
    // 7,264,213 JSOL * 1.3766 = 9,999,915 lamports, truncated to 5 decimals
    expect(valueUnder('Summary stake:')).toHaveTextContent(/^0\.00999 SOL$/)
    expect(valueUnder('Your balance:')).toHaveTextContent('0.00726 JSOL')
    expect(screen.queryByText(/Matching updates next epoch/)).not.toBeInTheDocument()
    expect(fetchValidatorProfileMock).not.toHaveBeenCalled()
  })

  it('explains the summary stake in a tooltip', () => {
    const { container } = renderBlock(manage())
    expect(container.querySelector('.jm-tooltip')).toHaveAttribute(
      'data-tooltip',
      'JSOL that JPool counts for DeepStake, in SOL at the current pool rate.'
    )
  })

  it('names this validator for memo deposits without a binding (counted first)', () => {
    renderBlock(manage({ uiStatus: 'not_bound', binding: null }))
    expect(valueUnder('Staked to:')).toHaveTextContent('DeepStake')
    expect(valueUnder('Staked to:')).toHaveClass('jm-tone-here')
  })

  it('names this validator when bound here even if nothing is counted yet', () => {
    renderBlock(manage({ directStakes: [], countedForValidator: '0' }))
    expect(valueUnder('Staked to:')).toHaveClass('jm-tone-here')
    expect(valueUnder('Summary stake:')).toHaveTextContent('0.00000 SOL')
  })

  it('keeps this validator when counted, even if the binding points elsewhere', () => {
    renderBlock(
      manage({
        uiStatus: 'bound_elsewhere',
        binding: { voteId: OTHER_VOTE, amount: '5', updatedAt: null },
      })
    )
    expect(valueUnder('Staked to:')).toHaveTextContent('DeepStake')
    expect(screen.getByText(/Your JPool binding points to another validator/)).toBeInTheDocument()
  })

  it('shows another validator in amber, with its name once loaded', async () => {
    fetchValidatorProfileMock.mockResolvedValue({ name: 'Other Validator' })
    renderBlock(
      manage({
        uiStatus: 'bound_elsewhere',
        binding: { voteId: OTHER_VOTE, amount: '5', updatedAt: null },
        directStakes: [],
        countedForValidator: '0',
      })
    )
    const stakedTo = valueUnder('Staked to:')
    expect(stakedTo).toHaveClass('jm-tone-elsewhere')
    expect(stakedTo).toHaveTextContent('Vote11...111111')
    await waitFor(() => expect(stakedTo).toHaveTextContent('Other Validator'))
    expect(fetchValidatorProfileMock).toHaveBeenCalledWith(OTHER_VOTE, 'mainnet')
    expect(screen.getByRole('link', { name: 'JPool app' })).toHaveAttribute(
      'href',
      `https://app.jpool.one/validators/${WIDGET_VOTE}/direct`
    )
  })

  it('keeps the truncated key when the name lookup fails', async () => {
    fetchValidatorProfileMock.mockRejectedValue(new Error('down'))
    renderBlock(
      manage({
        uiStatus: 'bound_elsewhere',
        binding: { voteId: OTHER_VOTE, amount: null, updatedAt: null },
        directStakes: [],
        countedForValidator: '0',
      })
    )
    await waitFor(() => expect(fetchValidatorProfileMock).toHaveBeenCalled())
    expect(valueUnder('Staked to:')).toHaveTextContent('Vote11...111111')
  })

  it('shows an untouched wallet as not direct staked', () => {
    renderBlock(
      manage({
        uiStatus: 'not_bound',
        binding: null,
        directStakes: [],
        countedForValidator: '0',
        walletAtaBalance: '0',
        ataExists: false,
      })
    )
    expect(valueUnder('Staked to:')).toHaveTextContent('NOT DIRECT STAKED TO ANY VALIDATOR')
    expect(valueUnder('Staked to:')).toHaveClass('jm-tone-none')
    expect(valueUnder('Your balance:')).toHaveTextContent('0.00000 JSOL')
  })

  it('shows the matching hint when bound here and less is counted than held', () => {
    renderBlock(manage({ walletAtaBalance: '9000000' }))
    expect(
      screen.getByText('JPool refreshes balances in the background. Matching updates next epoch.')
    ).toBeInTheDocument()
  })

  it('degrades when the binding is unavailable but keeps the balance', () => {
    renderBlock(
      manage({
        uiStatus: 'error',
        binding: null,
        countedForValidator: null,
        sources: { wallet: 'ok', pool: 'ok', binding: 'unavailable', directStakes: 'ok' },
      })
    )
    expect(valueUnder('Staked to:')).toHaveTextContent('STATUS TEMPORARILY UNAVAILABLE')
    expect(valueUnder('Summary stake:')).toHaveTextContent('temporarily unavailable')
    expect(screen.getByText(UNAVAILABLE)).toBeInTheDocument()
    expect(valueUnder('Your balance:')).toHaveTextContent('0.00726 JSOL')
  })

  it('shows unknown amounts as unavailable', () => {
    renderBlock(
      manage({
        uiStatus: 'not_bound',
        binding: null,
        directStakes: null,
        countedForValidator: null,
        walletAtaBalance: null,
        ataExists: null,
      })
    )
    expect(valueUnder('Staked to:')).toHaveTextContent('STATUS TEMPORARILY UNAVAILABLE')
    expect(valueUnder('Summary stake:')).toHaveTextContent('temporarily unavailable')
    expect(valueUnder('Your balance:')).toHaveTextContent('temporarily unavailable')
  })

  it('shows the counted amount in JSOL when the pool rate is unavailable', () => {
    renderBlock(manage({ poolRate: null }))
    expect(valueUnder('Summary stake:')).toHaveTextContent(/^0\.00726 JSOL$/)
  })

  it('shows the unavailable note and unstake text without data', () => {
    renderBlock(null)
    expect(screen.getByText(UNAVAILABLE)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Jupiter' })).toBeInTheDocument()
  })

  it('keeps the bind cell empty without a wallet and offers only Jupiter for unstaking', () => {
    renderBlock(manage())
    expect(screen.getByTestId('jpool-bind-cell')).toBeEmptyDOMElement()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(
      screen.getByText(/To unstake it, sell them through your wallet or DEX\./)
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        /When selling, the distribution of direct stake will change proportionally\./
      )
    ).toBeInTheDocument()
    expect(screen.getAllByRole('link')).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'Jupiter' })).toHaveAttribute('href', 'https://jup.ag')
  })

  it('hosts the bind control in the 4th grid cell, keeping four cells', () => {
    const account = {
      address: '6vCSEqLYhE88vyppdpi7wa3aVbZhKffuAFcQhwqFfV3',
      features: ['solana:signTransaction'],
      chains: ['solana:mainnet'],
    } as unknown as UiWalletAccount
    const { container } = render(
      <JpoolManageBlock
        data={manage({ binding: null, uiStatus: 'not_bound' })}
        network="mainnet"
        validatorInfo={profile}
        widgetVoteAccount={WIDGET_VOTE}
        account={account}
      />
    )
    expect(container.querySelectorAll('.jm-grid > .jm-cell')).toHaveLength(4)
    // A wallet without signMessage gets the JPool link in that cell.
    expect(screen.getByTestId('jpool-bind-cell')).toHaveTextContent(
      'Your wallet does not support message signing.'
    )
  })

  it('falls back to the truncated widget vote without a validator profile', () => {
    renderBlock(manage(), null)
    expect(valueUnder('Staked to:')).toHaveTextContent('DeEpSd...3HTpL5')
  })
})
