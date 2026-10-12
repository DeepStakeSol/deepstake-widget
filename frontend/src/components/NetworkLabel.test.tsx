import { render, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { NetworkProvider, useNetwork } from '../context/NetworkContext'
import { OptionsContext, type Options } from '../options'
import { getCurrentChain } from '../utils/config'
import { NetworkLabel } from './NetworkLabel'

function ChainProbe() {
  const { network } = useNetwork()
  return <span data-testid="chain">{getCurrentChain(network)}</span>
}

function Widget({ options }: { options: Options }) {
  return (
    <div data-testid={`widget-${options.network}`}>
      <OptionsContext.Provider value={options}>
        <NetworkProvider>
          <NetworkLabel />
          <ChainProbe />
        </NetworkProvider>
      </OptionsContext.Provider>
    </div>
  )
}

// Regression for D1: the demo page mounts a mainnet and a devnet copy side by
// side, so the network must come from each copy's options, not a page-wide value.
describe('NetworkLabel with several widgets on a page', () => {
  it('labels and signs each copy for its own network', () => {
    vi.stubEnv('VITE_NEXT_PUBLIC_NETWORK_ENV', '')
    const { getByTestId } = render(
      <>
        <Widget options={{ vote_account: 'vote', theme: 'dark', network: 'mainnet' }} />
        <Widget options={{ vote_account: 'vote', theme: 'dark', network: 'devnet' }} />
      </>
    )

    const mainnet = within(getByTestId('widget-mainnet'))
    const devnet = within(getByTestId('widget-devnet'))
    expect(mainnet.queryByText('Devnet')).toBeNull()
    expect(devnet.getByText('Devnet')).toBeInTheDocument()
    expect(mainnet.getByTestId('chain')).toHaveTextContent('solana:mainnet')
    expect(devnet.getByTestId('chain')).toHaveTextContent('solana:devnet')
  })
})
