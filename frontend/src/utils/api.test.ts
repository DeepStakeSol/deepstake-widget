import { beforeEach, describe, expect, it, vi } from 'vitest'

async function loadApi() {
  vi.resetModules()
  vi.stubEnv('VITE_BACKEND_URL', 'https://backend.example')
  return import('./api')
}

function mockJsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return Promise.resolve({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: () => Promise.resolve(body),
  } as Response)
}

describe('API helpers', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('does not retain resolved stake accounts in the browser', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockReturnValue(mockJsonResponse({ stakeAccounts: [{ address: 'stake-account' }] }))
    const { fetchStakeAccounts } = await loadApi()

    const first = await fetchStakeAccounts('owner', 'devnet')
    const second = await fetchStakeAccounts('owner', 'devnet')

    expect(first).toEqual([{ address: 'stake-account' }])
    expect(second).toBe(first)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://backend.example/api/stake/fetch?owner=owner&network=devnet'
    )
  })

  it('deduplicates concurrent stake account requests', async () => {
    const fetchMock = vi.mocked(fetch)
    let resolveResponse!: (response: Response) => void
    fetchMock.mockReturnValue(
      new Promise((resolve) => {
        resolveResponse = resolve
      })
    )
    const { fetchStakeAccounts } = await loadApi()

    const first = fetchStakeAccounts('owner', 'mainnet')
    const second = fetchStakeAccounts('owner', 'mainnet')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    resolveResponse(await mockJsonResponse({ stakeAccounts: [] }))
    await expect(Promise.all([first, second])).resolves.toEqual([[], []])
  })

  it('caches SOL balance requests', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockReturnValue(mockJsonResponse({ solBalance: 4.25 }))
    const { fetchSolBalance } = await loadApi()

    await expect(fetchSolBalance('wallet', 'mainnet')).resolves.toBe(4.25)
    await expect(fetchSolBalance('wallet', 'mainnet')).resolves.toBe(4.25)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://backend.example/api/balance?address=wallet&network=mainnet'
    )
  })

  it('caches LST balance requests by mint', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockReturnValue(mockJsonResponse({ lst: '2500000000' }))
    const { fetchLSTBalance } = await loadApi()

    await expect(fetchLSTBalance('wallet', 'mainnet', 'mint')).resolves.toBe(2.5)
    await expect(fetchLSTBalance('wallet', 'mainnet', 'mint')).resolves.toBe(2.5)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://backend.example/api/vbalance?address=wallet&network=mainnet&mint=mint'
    )
  })

  it('does not retain resolved vault manage requests in the browser', async () => {
    const fetchMock = vi.mocked(fetch)
    const response = {
      wallet: 'wallet',
      binding: { hasBinding: true },
      balance: { vsol: '1' },
      stakebot: { found: true },
      uiStatus: 'ready',
    }
    fetchMock.mockReturnValue(mockJsonResponse(response))
    const { fetchVaultManage } = await loadApi()

    const first = await fetchVaultManage('wallet', 'mainnet')
    const second = await fetchVaultManage('wallet', 'mainnet')

    expect(second).toEqual(first)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://backend.example/api/blaze/manage/vault?wallet=wallet&network=mainnet'
    )
  })

  it('reads Blaze applied stakes through the backend without a resolved browser cache', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockReturnValue(
      mockJsonResponse({ appliedStakes: [{ voteAcc: 'vote', amount: 12 }] })
    )
    const { fetchBlazeAppliedStakes } = await loadApi()

    await expect(fetchBlazeAppliedStakes('wallet', 'mainnet')).resolves.toEqual([
      { voteAcc: 'vote', amount: 12 },
    ])
    await expect(fetchBlazeAppliedStakes('wallet', 'mainnet')).resolves.toEqual([
      { voteAcc: 'vote', amount: 12 },
    ])

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://backend.example/api/blaze/manage/applied-stakes?wallet=wallet&network=mainnet'
    )
  })

  it('adds refresh=true for forced backend refreshes', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockReturnValue(mockJsonResponse({ stakeAccounts: [] }))
    const { fetchStakeAccounts } = await loadApi()

    await fetchStakeAccounts('owner', 'mainnet', { refresh: true })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://backend.example/api/stake/fetch?owner=owner&network=mainnet&refresh=true'
    )
  })

  it('posts stake transaction generation requests', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockReturnValue(mockJsonResponse({ wireTransaction: 'encoded-tx' }))
    const { generateStakeTransaction } = await loadApi()

    await expect(
      generateStakeTransaction('mainnet', {
        newAccountAddress: 'new-account',
        stakeLamports: 123,
        stakerAddress: 'staker',
        voteAccount: 'vote',
      })
    ).resolves.toBe('encoded-tx')

    expect(fetchMock).toHaveBeenCalledWith(
      'https://backend.example/api/stake/generate?network=mainnet',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newAccountAddress: 'new-account',
          stakeLamports: 123,
          stakerAddress: 'staker',
          voteAccount: 'vote',
        }),
      }
    )
  })

  it('throws on non-OK responses', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockReturnValue(mockJsonResponse({}, { ok: false, status: 500 }))
    const { fetchSolBalance } = await loadApi()

    await expect(fetchSolBalance('wallet', 'devnet')).rejects.toThrow(
      'HTTP error 500 when fetching https://backend.example/api/balance?address=wallet&network=devnet'
    )
  })
})
