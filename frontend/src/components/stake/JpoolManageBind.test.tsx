import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { UiWalletAccount } from '@wallet-standard/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { JpoolBindStatus } from '../../hooks/useJpoolBind'
import type { JpoolManageResponse } from '../../utils/jpool'

const mocks = vi.hoisted(() => ({
  hook: vi.fn(),
  bind: vi.fn(),
}))

vi.mock('../../hooks/useJpoolBind', () => ({ useJpoolBind: mocks.hook }))

import { manageBindErrorText } from '../../utils/jpool'
import { JpoolManageBind } from './JpoolManageBind'

const WALLET = '6vCSEqLYhE88vyppdpi7wa3aVbZhKffuAFcQhwqFfV3'
const PDA = 'HbJTxftxnXgpePCshA8FubsRj9MW4kfPscfuUfn44fnt'
const VOTE = 'DeEpSdaw8uBLQ5T2HQhDf8fBSVbm13jGqJwoSF3HTpL5'
const LATER = 'You can bind your wallet later on the Manage tab.'

function account(features = ['solana:signMessage'], address = WALLET) {
  return { address, features, chains: ['solana:mainnet'] } as unknown as UiWalletAccount
}

function data(uiStatus: JpoolManageResponse['uiStatus']) {
  return { uiStatus } as JpoolManageResponse
}

function hookState(status: JpoolBindStatus, extra: Record<string, unknown> = {}) {
  mocks.hook.mockReturnValue({
    status,
    result: null,
    error: null,
    bind: mocks.bind,
    reset: vi.fn(),
    ...extra,
  })
}

function renderBind(
  manage: JpoolManageResponse | null = data('not_bound'),
  wallet: UiWalletAccount = account()
) {
  return render(
    <JpoolManageBind
      account={wallet}
      data={manage}
      network="mainnet"
      voteAccount={VOTE}
      validatorName="DeepStake"
    />
  )
}

describe('JpoolManageBind', () => {
  beforeEach(() => {
    mocks.hook.mockReset()
    mocks.bind.mockReset().mockResolvedValue(undefined)
    hookState('idle')
  })

  it('offers Bind wallet with an explanation for a confirmed not_bound wallet', () => {
    renderBind()
    const button = screen.getByRole('button', { name: 'Bind wallet' })
    expect(button).toBeEnabled()
    expect(document.querySelector('.jm-tooltip')?.getAttribute('data-tooltip')).toMatch(
      /count for DeepStake.*Nothing is spent/
    )
    fireEvent.click(button)
    expect(mocks.bind).toHaveBeenCalledTimes(1)
    expect(mocks.hook).toHaveBeenCalledWith(
      expect.objectContaining({ voteAccount: VOTE, network: 'mainnet' })
    )
  })

  it.each([
    ['signing', 'Confirm in wallet…'],
    ['submitting', 'Binding…'],
  ] as const)('disables the pill while %s', (status, label) => {
    hookState(status)
    renderBind()
    const button = screen.getByRole('button', { name: label })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
  })

  it('keeps the pill after a declined signature', () => {
    hookState('rejected')
    renderBind()
    expect(screen.getByText('Signature request declined.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Bind wallet' })).toBeEnabled()
  })

  it('shows the error with the pill for a retry', () => {
    hookState('error', {
      error: {
        code: 'JPOOL_UNAVAILABLE',
        text: `JPool is temporarily unavailable. ${LATER}`,
        retryAfterSeconds: null,
      },
    })
    renderBind()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'JPool is temporarily unavailable. Please try again later.'
    )
    expect(screen.getByRole('button', { name: 'Bind wallet' })).toBeEnabled()
  })

  it.each([
    [false, 'Wallet bound to DeepStake.'],
    [true, 'Wallet already bound to DeepStake.'],
  ])('confirms success (alreadyBound=%s) whatever Manage says', (alreadyBound, text) => {
    hookState('success', { result: { alreadyBound } })
    renderBind(data('bound_here'))
    expect(screen.getByRole('status')).toHaveTextContent(text)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it.each(['bound_here', 'bound_elsewhere', 'error'] as const)(
    'offers no action when the status is %s',
    (uiStatus) => {
      renderBind(data(uiStatus))
      expect(screen.queryByRole('button')).not.toBeInTheDocument()
      expect(screen.queryByRole('link')).not.toBeInTheDocument()
    }
  )

  it('offers no action without Manage data', () => {
    renderBind(null)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it.each([
    ['no_sign_message', account(['solana:signTransaction'])],
    ['off_curve', account(['solana:signMessage'], PDA)],
  ])('links to JPool instead of binding for %s wallets', (reason, wallet) => {
    renderBind(data('not_bound'), wallet)
    expect(mocks.hook).not.toHaveBeenCalled()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'app.jpool.one' })).toHaveAttribute(
      'href',
      `https://app.jpool.one/validators/${VOTE}/direct`
    )
    expect(document.querySelector(`[data-reason="${reason}"]`)).toBeTruthy()
  })

  it('shows nothing for an unsupported wallet unless it is not_bound', () => {
    renderBind(data('bound_here'), account([]))
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})

describe('manageBindErrorText', () => {
  const error = (text: string) => ({ code: 'X', text, retryAfterSeconds: null })

  it('replaces the Manage-tab hint with a plain retry', () => {
    expect(manageBindErrorText(error(`JPool did not accept the binding. ${LATER}`))).toBe(
      'JPool did not accept the binding. Please try again later.'
    )
    expect(manageBindErrorText(error(LATER))).toBe('Binding failed. Please try again later.')
  })

  it('keeps texts without the hint', () => {
    expect(manageBindErrorText(error('Too many attempts. Please try again in 9 seconds.'))).toBe(
      'Too many attempts. Please try again in 9 seconds.'
    )
  })
})

describe('JpoolManageBind with the real hook', () => {
  it('signs once, posts the bind and hands the refreshed Manage up', async () => {
    vi.resetModules()
    vi.doUnmock('../../hooks/useJpoolBind')
    const signMessage = vi.fn(async ({ message }: { message: Uint8Array }) => ({
      signature: new Uint8Array(64).fill(1),
      signedMessage: message,
    }))
    const bindJpoolWallet = vi.fn().mockResolvedValue({
      success: true,
      alreadyBound: false,
      voteId: VOTE,
    })
    const refreshed = data('bound_here')
    const fetchJpoolManage = vi.fn().mockResolvedValue(refreshed)
    vi.doMock('@solana/react', () => ({ useSignMessage: () => signMessage }))
    vi.doMock('../../utils/jpool', async (importOriginal) => ({
      ...(await importOriginal<typeof import('../../utils/jpool')>()),
      bindJpoolWallet,
      fetchJpoolManage,
    }))
    const { JpoolManageBind: RealBind } = await import('./JpoolManageBind')
    const onManageLoaded = vi.fn()

    render(
      <RealBind
        account={account()}
        data={data('not_bound')}
        network="mainnet"
        voteAccount={VOTE}
        validatorName="DeepStake"
        onManageLoaded={onManageLoaded}
      />
    )
    const button = screen.getByRole('button', { name: 'Bind wallet' })
    await act(async () => {
      fireEvent.click(button)
      fireEvent.click(button)
    })

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Wallet bound to DeepStake.')
    )
    expect(signMessage).toHaveBeenCalledTimes(1)
    expect(bindJpoolWallet).toHaveBeenCalledTimes(1)
    expect(bindJpoolWallet.mock.calls[0][1]).toMatchObject({ wallet: WALLET })
    await waitFor(() => expect(onManageLoaded).toHaveBeenCalledWith(refreshed))
    expect(fetchJpoolManage).toHaveBeenCalledWith(WALLET, VOTE, 'mainnet', { refresh: true })
  })
})
