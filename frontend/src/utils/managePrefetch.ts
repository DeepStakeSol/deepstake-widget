import type { WidgetTab } from '../options'
import {
  fetchBlazeAppliedStakes,
  fetchLSTBalance,
  fetchStakeAccounts,
  fetchVaultManage,
} from './api'

export const BSOL_MINT = 'bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1'
export const VSOL_MINT = 'vSoLxydx6akxyMD9XEcPvGYNGq6Nn66oqVb3UkGkei7'

export async function prefetchManageData(
  provider: WidgetTab,
  walletAddress: string,
  network: string
): Promise<void> {
  if (provider === 'native') {
    await fetchStakeAccounts(walletAddress, network)
    return
  }

  if (provider === 'blaze') {
    const requests: Promise<unknown>[] = [fetchLSTBalance(walletAddress, network, BSOL_MINT)]

    if (network !== 'devnet') {
      requests.push(fetchBlazeAppliedStakes(walletAddress, network))
    }

    await Promise.all(requests)
    return
  }

  if (network === 'devnet') return

  await Promise.all([
    fetchLSTBalance(walletAddress, network, VSOL_MINT),
    fetchVaultManage(walletAddress, network),
  ])
}
