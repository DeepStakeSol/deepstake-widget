import type { WidgetTab } from '../options'
import {
  fetchBlazeAppliedStakes,
  fetchLSTBalance,
  fetchStakeAccounts,
  fetchVaultManage,
} from './api'
import { fetchJpoolManage } from './jpool'

export const BSOL_MINT = 'bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1'
export const VSOL_MINT = 'vSoLxydx6akxyMD9XEcPvGYNGq6Nn66oqVb3UkGkei7'

// Every provider has an explicit branch; an unknown value throws instead of
// silently prefetching another provider's data.
export async function prefetchManageData(
  provider: WidgetTab,
  walletAddress: string,
  network: string,
  voteAccount: string
): Promise<void> {
  switch (provider) {
    case 'native':
      await fetchStakeAccounts(walletAddress, network)
      return

    case 'blaze': {
      const requests: Promise<unknown>[] = [fetchLSTBalance(walletAddress, network, BSOL_MINT)]
      if (network !== 'devnet') {
        requests.push(fetchBlazeAppliedStakes(walletAddress, network))
      }
      await Promise.all(requests)
      return
    }

    case 'vault':
      if (network === 'devnet') return
      await Promise.all([
        fetchLSTBalance(walletAddress, network, VSOL_MINT),
        fetchVaultManage(walletAddress, network),
      ])
      return

    case 'jpool':
      if (network !== 'mainnet' || !voteAccount) return
      await fetchJpoolManage(walletAddress, voteAccount, network)
      return

    default: {
      const unknown: never = provider
      throw new Error(`Unknown widget tab: ${String(unknown)}`)
    }
  }
}
