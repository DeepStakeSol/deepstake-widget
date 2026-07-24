import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  fetchBlazeAppliedStakesMock,
  fetchLSTBalanceMock,
  fetchStakeAccountsMock,
  fetchVaultManageMock,
} = vi.hoisted(() => ({
  fetchBlazeAppliedStakesMock: vi.fn(),
  fetchLSTBalanceMock: vi.fn(),
  fetchStakeAccountsMock: vi.fn(),
  fetchVaultManageMock: vi.fn(),
}))

vi.mock('./api', () => ({
  fetchBlazeAppliedStakes: fetchBlazeAppliedStakesMock,
  fetchLSTBalance: fetchLSTBalanceMock,
  fetchStakeAccounts: fetchStakeAccountsMock,
  fetchVaultManage: fetchVaultManageMock,
}))

import { BSOL_MINT, VSOL_MINT, prefetchManageData } from './managePrefetch'

describe('Manage data prefetch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchBlazeAppliedStakesMock.mockResolvedValue([])
    fetchLSTBalanceMock.mockResolvedValue(0)
    fetchStakeAccountsMock.mockResolvedValue([])
    fetchVaultManageMock.mockResolvedValue({})
  })

  it('prefetches native stake accounts', async () => {
    await prefetchManageData('native', 'wallet', 'mainnet')

    expect(fetchStakeAccountsMock).toHaveBeenCalledWith('wallet', 'mainnet')
    expect(fetchLSTBalanceMock).not.toHaveBeenCalled()
  })

  it('prefetches Blaze balance and applied stakes on mainnet', async () => {
    await prefetchManageData('blaze', 'wallet', 'mainnet')

    expect(fetchLSTBalanceMock).toHaveBeenCalledWith('wallet', 'mainnet', BSOL_MINT)
    expect(fetchBlazeAppliedStakesMock).toHaveBeenCalledWith('wallet', 'mainnet')
  })

  it('skips Blaze applied stakes on devnet', async () => {
    await prefetchManageData('blaze', 'wallet', 'devnet')

    expect(fetchLSTBalanceMock).toHaveBeenCalledWith('wallet', 'devnet', BSOL_MINT)
    expect(fetchBlazeAppliedStakesMock).not.toHaveBeenCalled()
  })

  it('prefetches Vault data only on mainnet', async () => {
    await prefetchManageData('vault', 'wallet', 'mainnet')

    expect(fetchLSTBalanceMock).toHaveBeenCalledWith('wallet', 'mainnet', VSOL_MINT)
    expect(fetchVaultManageMock).toHaveBeenCalledWith('wallet', 'mainnet')

    vi.clearAllMocks()
    await prefetchManageData('vault', 'wallet', 'devnet')
    expect(fetchLSTBalanceMock).not.toHaveBeenCalled()
    expect(fetchVaultManageMock).not.toHaveBeenCalled()
  })
})
