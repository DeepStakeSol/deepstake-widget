import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  fetchBlazeAppliedStakesMock,
  fetchLSTBalanceMock,
  fetchStakeAccountsMock,
  fetchVaultManageMock,
  fetchJpoolManageMock,
} = vi.hoisted(() => ({
  fetchJpoolManageMock: vi.fn(),
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

vi.mock('./jpool', () => ({ fetchJpoolManage: fetchJpoolManageMock }))

import { BSOL_MINT, VSOL_MINT, prefetchManageData } from './managePrefetch'

describe('Manage data prefetch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchBlazeAppliedStakesMock.mockResolvedValue([])
    fetchLSTBalanceMock.mockResolvedValue(0)
    fetchStakeAccountsMock.mockResolvedValue([])
    fetchVaultManageMock.mockResolvedValue({})
    fetchJpoolManageMock.mockResolvedValue({})
  })

  it('prefetches native stake accounts', async () => {
    await prefetchManageData('native', 'wallet', 'mainnet', 'vote')

    expect(fetchStakeAccountsMock).toHaveBeenCalledWith('wallet', 'mainnet')
    expect(fetchLSTBalanceMock).not.toHaveBeenCalled()
  })

  it('prefetches Blaze balance and applied stakes on mainnet', async () => {
    await prefetchManageData('blaze', 'wallet', 'mainnet', 'vote')

    expect(fetchLSTBalanceMock).toHaveBeenCalledWith('wallet', 'mainnet', BSOL_MINT)
    expect(fetchBlazeAppliedStakesMock).toHaveBeenCalledWith('wallet', 'mainnet')
  })

  it('skips Blaze applied stakes on devnet', async () => {
    await prefetchManageData('blaze', 'wallet', 'devnet', 'vote')

    expect(fetchLSTBalanceMock).toHaveBeenCalledWith('wallet', 'devnet', BSOL_MINT)
    expect(fetchBlazeAppliedStakesMock).not.toHaveBeenCalled()
  })

  it('prefetches Vault data only on mainnet', async () => {
    await prefetchManageData('vault', 'wallet', 'mainnet', 'vote')

    expect(fetchLSTBalanceMock).toHaveBeenCalledWith('wallet', 'mainnet', VSOL_MINT)
    expect(fetchVaultManageMock).toHaveBeenCalledWith('wallet', 'mainnet')

    vi.clearAllMocks()
    await prefetchManageData('vault', 'wallet', 'devnet', 'vote')
    expect(fetchLSTBalanceMock).not.toHaveBeenCalled()
    expect(fetchVaultManageMock).not.toHaveBeenCalled()
  })

  it('prefetches JPool Manage for the widget vote on mainnet only', async () => {
    await prefetchManageData('jpool', 'wallet', 'mainnet', 'vote')
    expect(fetchJpoolManageMock).toHaveBeenCalledWith('wallet', 'vote', 'mainnet')
    expect(fetchLSTBalanceMock).not.toHaveBeenCalled()
    expect(fetchVaultManageMock).not.toHaveBeenCalled()

    vi.clearAllMocks()
    await prefetchManageData('jpool', 'wallet', 'devnet', 'vote')
    await prefetchManageData('jpool', 'wallet', 'mainnet', '')
    expect(fetchJpoolManageMock).not.toHaveBeenCalled()
  })

  it('throws on an unknown provider instead of falling through', async () => {
    await expect(
      prefetchManageData('marinade' as never, 'wallet', 'mainnet', 'vote')
    ).rejects.toThrow('Unknown widget tab: marinade')
    expect(fetchVaultManageMock).not.toHaveBeenCalled()
  })
})
