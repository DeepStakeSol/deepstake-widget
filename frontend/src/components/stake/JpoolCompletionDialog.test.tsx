import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { UiWalletAccount } from '@wallet-standard/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { JpoolBindStatus } from '../../hooks/useJpoolBind'
import type { JpoolManageResponse } from '../../utils/jpool'
import type { JpoolCompletion } from '../../utils/jpoolCopy'

const mocks = vi.hoisted(() => ({ hook: vi.fn(), bind: vi.fn() }))
vi.mock('../../hooks/useJpoolBind', () => ({ useJpoolBind: mocks.hook }))
vi.mock('../../utils/config', () => ({
  getExplorerTxUrl: ({ signature, explorer }: { signature: string; explorer: string }) =>
    `https://${explorer}.example/tx/${signature}`,
}))

import { JpoolCompletionDialog, type JpoolCompletionDialogProps } from './JpoolCompletionDialog'

const WALLET = '6vCSEqLYhE88vyppdpi7wa3aVbZhKffuAFcQhwqFfV3'
const PDA = 'HbJTxftxnXgpePCshA8FubsRj9MW4kfPscfuUfn44fnt'
const VOTE = 'DeEpSdaw8uBLQ5T2HQhDf8fBSVbm13jGqJwoSF3HTpL5'
const LATER = 'You can bind your wallet later on the Manage tab.'

const COMPLETED: JpoolCompletion = {
  signature: 'sig-1',
  expectedJsol: BigInt(7_264_274),
  registration: 'pending',
}

function account(features = ['solana:signMessage'], address = WALLET) {
  return { address, features, chains: ['solana:mainnet'] } as unknown as UiWalletAccount
}

function manage(uiStatus: JpoolManageResponse['uiStatus']) {
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

function props(overrides: Partial<JpoolCompletionDialogProps> = {}): JpoolCompletionDialogProps {
  return {
    completed: COMPLETED,
    manage: manage('not_bound'),
    manageFailed: false,
    account: account(),
    voteAccount: VOTE,
    network: 'mainnet',
    validatorName: 'DeepStake',
    onManageLoaded: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  }
}

function renderDialog(overrides: Partial<JpoolCompletionDialogProps> = {}) {
  const p = props(overrides)
  const view = render(<JpoolCompletionDialog {...p} />)
  return { ...view, props: p }
}

describe('JpoolCompletionDialog shell', () => {
  beforeEach(() => {
    mocks.hook.mockReset()
    mocks.bind.mockReset()
    hookState('idle')
  })

  it('shows the deposit, registration progress and explorer links', () => {
    renderDialog()
    const dialog = screen.getByRole('dialog', { name: 'Stake sent to JPool' })
    expect(dialog).toHaveTextContent(
      'You received ~0.007264 JSOL. Your deposit is tagged for DeepStake via JPool direct staking.'
    )
    expect(dialog).toHaveTextContent(
      'JPool usually registers a deposit within 5 minutes. Checking…'
    )
    const links = within(dialog).getAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual(['Explorer', 'Solscan', 'Orb'])
    expect(links[1]).toHaveAttribute('href', 'https://solscan.example/tx/sig-1')
  })

  it('updates the registration line', () => {
    const { rerender, props: p } = renderDialog()
    rerender(
      <JpoolCompletionDialog {...p} completed={{ ...COMPLETED, registration: 'registered' }} />
    )
    expect(screen.getByText('JPool has registered this deposit for DeepStake.')).toBeInTheDocument()
  })

  it('closes with the button and with Escape, and takes focus', () => {
    const { props: p } = renderDialog()
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveFocus()
    fireEvent.keyDown(dialog, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(p.onClose).toHaveBeenCalledTimes(2)
  })

  it('renders into its own widget root when a page has several', () => {
    const first = document.createElement('div')
    first.className = 'sw-container'
    const second = document.createElement('div')
    second.className = 'sw-container'
    const host = document.createElement('div')
    second.appendChild(host)
    document.body.append(first, second)

    render(<JpoolCompletionDialog {...props()} />, { container: host })
    const dialog = screen.getByRole('dialog')
    expect(second.contains(dialog)).toBe(true)
    expect(first.contains(dialog)).toBe(false)
    first.remove()
    second.remove()
  })
})

describe('JpoolCompletionDialog bind step', () => {
  beforeEach(() => {
    mocks.hook.mockReset()
    mocks.bind.mockReset().mockResolvedValue(undefined)
    hookState('idle')
  })

  it('checks the binding while the first Manage read is pending', () => {
    renderDialog({ manage: null })
    expect(screen.getByText('Checking your JPool binding…')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Bind wallet' })).not.toBeInTheDocument()
  })

  it.each([
    ['a failed read', { manage: null, manageFailed: true }],
    ['uiStatus error', { manage: manage('error') }],
  ])('offers no action when the binding is unknown (%s)', (_name, overrides) => {
    renderDialog(overrides)
    expect(
      screen.getByText(`Binding status is temporarily unavailable. ${LATER}`)
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Bind wallet' })).not.toBeInTheDocument()
  })

  it('says already bound for bound_here', () => {
    renderDialog({ manage: manage('bound_here') })
    expect(screen.getByText('Your wallet is already bound to DeepStake.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Bind wallet' })).not.toBeInTheDocument()
  })

  it('shows the JPool app note for bound_elsewhere, without a button', () => {
    renderDialog({ manage: manage('bound_elsewhere') })
    expect(screen.getByText(/points to another validator/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'JPool app' })).toHaveAttribute(
      'href',
      `https://app.jpool.one/validators/${VOTE}/direct`
    )
    expect(screen.queryByRole('button', { name: 'Bind wallet' })).not.toBeInTheDocument()
  })

  it.each([
    ['no_sign_message', account(['solana:signTransaction'])],
    ['off_curve', account(['solana:signMessage'], PDA)],
  ])('links to JPool for %s wallets', (reason, wallet) => {
    renderDialog({ account: wallet })
    expect(screen.getByText('Bind your wallet to DeepStake?')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'app.jpool.one' })).toBeInTheDocument()
    expect(document.querySelector(`[data-reason="${reason}"]`)).toBeTruthy()
    expect(mocks.hook).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Bind wallet' })).not.toBeInTheDocument()
  })

  it('offers Bind and Skip for a not_bound wallet', () => {
    renderDialog()
    expect(screen.getByText('Bind your wallet to DeepStake?')).toBeInTheDocument()
    expect(screen.getByText(/count for DeepStake.*Nothing is spent\./)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Bind wallet' }))
    expect(mocks.bind).toHaveBeenCalledTimes(1)
  })

  it('keeps the first known status when a later poll disagrees', () => {
    const { rerender, props: p } = renderDialog()
    rerender(<JpoolCompletionDialog {...p} manage={manage('bound_elsewhere')} />)
    expect(screen.getByRole('button', { name: 'Bind wallet' })).toBeInTheDocument()
    expect(screen.queryByText(/points to another validator/)).not.toBeInTheDocument()
  })

  it('upgrades an unknown status once a poll knows it', () => {
    const { rerender, props: p } = renderDialog({ manage: manage('error') })
    rerender(<JpoolCompletionDialog {...p} manage={manage('not_bound')} />)
    expect(screen.getByRole('button', { name: 'Bind wallet' })).toBeInTheDocument()
    rerender(<JpoolCompletionDialog {...p} manage={manage('error')} />)
    expect(screen.getByRole('button', { name: 'Bind wallet' })).toBeInTheDocument()
  })

  it.each([
    ['signing', 'Confirm in wallet…'],
    ['submitting', 'Binding…'],
  ] as const)('disables Bind and Skip while %s, but not Close', (status, label) => {
    hookState(status)
    renderDialog()
    const bind = screen.getByRole('button', { name: label })
    expect(bind).toBeDisabled()
    expect(bind).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('button', { name: 'Skip' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Close' })).toBeEnabled()
  })

  it.each([
    [false, 'Wallet bound to DeepStake.'],
    [true, 'Wallet already bound to DeepStake.'],
  ])('confirms a bind (alreadyBound=%s)', (alreadyBound, text) => {
    hookState('success', { result: { alreadyBound } })
    renderDialog()
    expect(screen.getByText(text)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Bind wallet' })).not.toBeInTheDocument()
  })

  it('shows the JPool app note when the bind finds another binding', () => {
    hookState('bound_elsewhere', { result: { boundTo: PDA } })
    renderDialog()
    expect(screen.getByText(/points to another validator/)).toBeInTheDocument()
  })

  it('points to Manage after a declined signature, without a retry', () => {
    hookState('rejected')
    renderDialog()
    expect(screen.getByText(LATER)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Bind wallet' })).not.toBeInTheDocument()
  })

  it('shows the error text after a failed bind, without a retry', () => {
    hookState('error', {
      error: {
        code: 'JPOOL_UNAVAILABLE',
        text: `JPool is temporarily unavailable. ${LATER}`,
        retryAfterSeconds: null,
      },
    })
    renderDialog()
    expect(screen.getByText(`JPool is temporarily unavailable. ${LATER}`)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Bind wallet' })).not.toBeInTheDocument()
  })

  it('skips without calling bind and keeps the deposit result', () => {
    renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
    expect(mocks.bind).not.toHaveBeenCalled()
    expect(screen.queryByText('Bind your wallet to DeepStake?')).not.toBeInTheDocument()
    expect(screen.getByText(/You received ~0\.007264 JSOL/)).toBeInTheDocument()
    expect(screen.getAllByRole('link')).toHaveLength(3)
  })
})

describe('JpoolCompletionDialog with the real hook', () => {
  async function loadReal(signMessage: ReturnType<typeof vi.fn>) {
    vi.resetModules()
    vi.doUnmock('../../hooks/useJpoolBind')
    const bindJpoolWallet = vi.fn().mockResolvedValue({
      success: true,
      alreadyBound: false,
      voteId: VOTE,
    })
    const fetchJpoolManage = vi.fn().mockResolvedValue(manage('bound_here'))
    vi.doMock('@solana/react', () => ({ useSignMessage: () => signMessage }))
    vi.doMock('../../utils/jpool', async (importOriginal) => ({
      ...(await importOriginal<typeof import('../../utils/jpool')>()),
      bindJpoolWallet,
      fetchJpoolManage,
    }))
    const { JpoolCompletionDialog: Real } = await import('./JpoolCompletionDialog')
    return { Real, bindJpoolWallet, fetchJpoolManage }
  }

  it('binds once from the dialog', async () => {
    const signMessage = vi.fn(async ({ message }: { message: Uint8Array }) => ({
      signature: new Uint8Array(64).fill(1),
      signedMessage: message,
    }))
    const { Real, bindJpoolWallet } = await loadReal(signMessage)
    const p = props()
    render(<Real {...p} />)
    const button = screen.getByRole('button', { name: 'Bind wallet' })
    await act(async () => {
      fireEvent.click(button)
      fireEvent.click(button)
    })
    await waitFor(() => expect(screen.getByText('Wallet bound to DeepStake.')).toBeInTheDocument())
    expect(signMessage).toHaveBeenCalledTimes(1)
    expect(bindJpoolWallet).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(p.onManageLoaded).toHaveBeenCalledWith(manage('bound_here')))
  })

  it('never posts a signature that arrives after the dialog closed', async () => {
    let resolveSign!: (value: unknown) => void
    const signMessage = vi.fn(() => new Promise((resolve) => (resolveSign = resolve)))
    const { Real, bindJpoolWallet } = await loadReal(signMessage)
    const { unmount } = render(<Real {...props()} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Bind wallet' }))
    })
    const message = (signMessage.mock.calls[0] as unknown as [{ message: Uint8Array }])[0].message
    unmount()
    await act(async () => {
      resolveSign({ signature: new Uint8Array(64), signedMessage: message })
    })
    expect(bindJpoolWallet).not.toHaveBeenCalled()
  })
})
