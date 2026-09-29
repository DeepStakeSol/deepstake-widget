import { render, screen, waitFor } from '@testing-library/react'
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

function renderBlock(data: JpoolManageResponse | null, isLoading = false) {
  return render(
    <JpoolManageBlock
      data={data}
      isLoading={isLoading}
      network="mainnet"
      validatorInfo={profile}
      widgetVoteAccount={WIDGET_VOTE}
    />
  )
}

describe('JpoolManageBlock', () => {
  beforeEach(() => {
    fetchValidatorProfileMock.mockReset()
  })

  it('shows a bound-here wallet in green with directed stake and balance', () => {
    const { container } = renderBlock(manage())
    const status = container.querySelector('.jm-status')
    expect(status).toHaveTextContent('DeepStake')
    expect(status).toHaveClass('jm-status-here')
    expect(screen.getByText('Directed to DeepStake:').nextElementSibling).toHaveTextContent(
      '0.007264 JSOL (~0.009999 SOL)'
    )
    expect(screen.getByText('Your balance:').nextElementSibling).toHaveTextContent('0.007264 JSOL')
    expect(screen.queryByText(/Matching updates next epoch/)).not.toBeInTheDocument()
    expect(fetchValidatorProfileMock).not.toHaveBeenCalled()
  })

  it('shows the matching hint when bound here and less is counted than held', () => {
    renderBlock(manage({ walletAtaBalance: '9000000' }))
    expect(
      screen.getByText('JPool refreshes balances in the background. Matching updates next epoch.')
    ).toBeInTheDocument()
  })

  it('shows another validator in amber, with its name once loaded', async () => {
    fetchValidatorProfileMock.mockResolvedValue({ name: 'Other Validator' })
    const { container } = renderBlock(
      manage({
        uiStatus: 'bound_elsewhere',
        binding: { voteId: OTHER_VOTE, amount: '5', updatedAt: null },
      })
    )
    const status = container.querySelector('.jm-status')
    expect(status).toHaveClass('jm-status-elsewhere')
    expect(status).toHaveTextContent('Vote11...111111')
    await waitFor(() => expect(status).toHaveTextContent('Other Validator'))
    expect(fetchValidatorProfileMock).toHaveBeenCalledWith(OTHER_VOTE, 'mainnet')
    expect(screen.queryByText(/Matching updates next epoch/)).not.toBeInTheDocument()
  })

  it('keeps the truncated key when the name lookup fails', async () => {
    fetchValidatorProfileMock.mockRejectedValue(new Error('down'))
    const { container } = renderBlock(
      manage({
        uiStatus: 'bound_elsewhere',
        binding: { voteId: OTHER_VOTE, amount: null, updatedAt: null },
      })
    )
    await waitFor(() => expect(fetchValidatorProfileMock).toHaveBeenCalled())
    expect(container.querySelector('.jm-status')).toHaveTextContent('Vote11...111111')
  })

  it('shows an unbound wallet in gray', () => {
    const { container } = renderBlock(
      manage({ uiStatus: 'not_bound', binding: null, directStakes: [], countedForValidator: '0' })
    )
    const status = container.querySelector('.jm-status')
    expect(status).toHaveTextContent('Not bound to any validator')
    expect(status).toHaveClass('jm-status-none')
    expect(screen.getByText('Directed to DeepStake:').nextElementSibling).toHaveTextContent(
      '0 JSOL (~0 SOL)'
    )
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
    expect(screen.getByText('Status temporarily unavailable')).toBeInTheDocument()
    expect(screen.getByText('Directed to DeepStake:').nextElementSibling).toHaveTextContent(
      'temporarily unavailable'
    )
    expect(screen.getByText(UNAVAILABLE)).toBeInTheDocument()
    expect(screen.getByText('Your balance:').nextElementSibling).toHaveTextContent('0.007264 JSOL')
  })

  it('shows unknown direct stakes and wallet balance as unavailable', () => {
    renderBlock(
      manage({
        directStakes: null,
        countedForValidator: null,
        walletAtaBalance: null,
        ataExists: null,
        sources: { wallet: 'unavailable', pool: 'ok', binding: 'ok', directStakes: 'unavailable' },
      })
    )
    expect(screen.getByText('Directed to DeepStake:').nextElementSibling).toHaveTextContent(
      'temporarily unavailable'
    )
    expect(screen.getByText('Your balance:').nextElementSibling).toHaveTextContent(
      'temporarily unavailable'
    )
  })

  it('omits the SOL estimate when the pool rate is unavailable', () => {
    renderBlock(manage({ poolRate: null }))
    expect(screen.getByText('Directed to DeepStake:').nextElementSibling).toHaveTextContent(
      /^0\.007264 JSOL$/
    )
  })

  it('renders the loading and no-data states', () => {
    const { rerender } = renderBlock(null, true)
    expect(screen.getByText('Loading JPool data…')).toBeInTheDocument()
    rerender(
      <JpoolManageBlock
        data={null}
        isLoading={false}
        network="mainnet"
        validatorInfo={profile}
        widgetVoteAccount={WIDGET_VOTE}
      />
    )
    expect(screen.getByText(UNAVAILABLE)).toBeInTheDocument()
  })

  it('keeps the bind slot empty and links to the JPool app and Jupiter', () => {
    renderBlock(manage({ uiStatus: 'not_bound', binding: null }))
    expect(screen.getByTestId('jpool-bind-slot')).toBeEmptyDOMElement()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'JPool app' })).toHaveAttribute(
      'href',
      'https://app.jpool.one'
    )
    expect(screen.getByRole('link', { name: 'Jupiter' })).toHaveAttribute('href', 'https://jup.ag')
  })

  it('falls back to the truncated widget vote without a validator profile', () => {
    render(
      <JpoolManageBlock
        data={manage()}
        isLoading={false}
        network="mainnet"
        validatorInfo={null}
        widgetVoteAccount={WIDGET_VOTE}
      />
    )
    expect(screen.getByText('Directed to DeEpSd...3HTpL5:')).toBeInTheDocument()
  })
})
