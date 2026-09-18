import { screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./App.tsx', () => ({
  default: () => <div>mounted widget</div>,
}))

vi.mock('./context/NetworkContext', () => ({
  NetworkProvider: ({ children }: { children: React.ReactNode }) => children,
}))

import { mountDeepStakeWidgets } from './main'

const VOTE_ACCOUNT = 'Vote111111111111111111111111111111111111111'

describe('mountDeepStakeWidgets', () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  it('continues mounting attribute and legacy roots after an invalid config', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const validOptions = JSON.stringify({
      vote_account: VOTE_ACCOUNT,
      network: 'devnet',
      telemetry: false,
    })

    document.body.innerHTML = `
      <div id="broken" data-widget="deepstake"
        data-options='{"vote_account":"${VOTE_ACCOUNT}",}'></div>
      <div id="following" data-widget="deepstake"
        data-options='${validOptions}'></div>
      <div id="root" data-options='${validOptions}'></div>
    `

    mountDeepStakeWidgets()

    expect(
      await screen.findByText('DeepStake widget: invalid configuration, check data-options')
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getAllByText('mounted widget')).toHaveLength(2)
    })

    const broken = document.getElementById('broken')
    const legacy = document.getElementById('root')
    expect(broken).toHaveAttribute('data-theme', 'dark')
    expect(legacy).toHaveAttribute('data-widget', 'deepstake')
    expect(
      consoleError.mock.calls.some(
        ([message, element, error]) =>
          message === '[DeepStake widget] invalid config' &&
          element === broken &&
          error instanceof Error &&
          error.message === 'data-options must contain valid JSON'
      )
    ).toBe(true)
  })
})
