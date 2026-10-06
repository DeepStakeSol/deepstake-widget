import { beforeEach, describe, expect, it, vi } from 'vitest'

const VOTE = 'DeEpSdaw8uBLQ5T2HQhDf8fBSVbm13jGqJwoSF3HTpL5'
const WALLET = '4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T'

async function loadModules() {
  vi.resetModules()
  vi.stubEnv('VITE_BACKEND_URL', 'https://backend.example')
  const jpool = await import('./jpool')
  const { BackendRequestError } = await import('./backendRequest')
  return { ...jpool, BackendRequestError }
}

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response)
}

// A fetch that never settles until its signal aborts.
function hangingFetch() {
  return vi.fn(
    (_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError'))
        )
      })
  )
}

const POOL = {
  network: 'mainnet',
  poolAddress: 'CtMyWsrUtAwXWiGr9WjHT5fC3p3fgV8cyGpLTo2LJzG1',
  totalLamports: '1376600000',
  poolTokenSupply: '1000000000',
  lastUpdateEpoch: '1045',
  solDepositFee: { denominator: '0', numerator: '0' },
  depositsRestricted: false,
}

describe('JPool API clients', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('posts stake lamports as a decimal string', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockReturnValue(
      jsonResponse({ transaction: 'AQID', quote: { expectedJsol: '7264274' } })
    )
    const { generateJpoolStakeTransaction } = await loadModules()

    await expect(
      generateJpoolStakeTransaction('mainnet', {
        wallet: WALLET,
        voteAccount: VOTE,
        stakeLamports: BigInt('18446744073709551615'),
      })
    ).resolves.toEqual({ transaction: 'AQID', quote: { expectedJsol: '7264274' } })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://backend.example/api/jpool/stake/generate?network=mainnet')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(init?.body as string)).toEqual({
      wallet: WALLET,
      voteAccount: VOTE,
      stakeLamports: '18446744073709551615',
    })
  })

  it('surfaces backend error codes from generate', async () => {
    vi.mocked(fetch).mockReturnValue(
      jsonResponse({ error: 'updating', code: 'JPOOL_POOL_UPDATING' }, 503)
    )
    const { generateJpoolStakeTransaction, getJpoolErrorText } = await loadModules()

    const error = await generateJpoolStakeTransaction('mainnet', {
      wallet: WALLET,
      voteAccount: VOTE,
      stakeLamports: BigInt(1),
    }).catch((e: unknown) => e)
    expect(error).toMatchObject({ status: 503, code: 'JPOOL_POOL_UPDATING' })
    expect(getJpoolErrorText(error)).toBe(
      'JPool is updating for the new epoch. Please try again in a few minutes.'
    )
  })

  it('caches the pool briefly and quotes from it', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockImplementation(() => jsonResponse(POOL))
    const { fetchJpoolPool, quoteJsolForPool } = await loadModules()

    const pool = await fetchJpoolPool('mainnet')
    await fetchJpoolPool('mainnet')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('https://backend.example/api/jpool/pool?network=mainnet')
    expect(quoteJsolForPool(pool, BigInt(10_000_000))).toBe(BigInt(7_264_274))
    expect(quoteJsolForPool(pool, BigInt(0))).toBeNull()
    expect(quoteJsolForPool({ ...pool, totalLamports: 'garbage' }, BigInt(1))).toBeNull()
  })

  it('deduplicates Manage requests and passes refresh', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockImplementation(() => jsonResponse({ uiStatus: 'not_bound' }))
    const { fetchJpoolManage } = await loadModules()

    await Promise.all([
      fetchJpoolManage(WALLET, VOTE, 'mainnet'),
      fetchJpoolManage(WALLET, VOTE, 'mainnet'),
    ])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenLastCalledWith(
      `https://backend.example/api/jpool/manage?wallet=${WALLET}&vote=${VOTE}&network=mainnet`
    )

    await fetchJpoolManage(WALLET, VOTE, 'mainnet', { refresh: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenLastCalledWith(
      `https://backend.example/api/jpool/manage?wallet=${WALLET}&vote=${VOTE}&network=mainnet&refresh=true`
    )
  })
})

describe('fetchJpoolEligibility', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('returns the backend verdict', async () => {
    const verdict = { eligible: false, reason: 'superminority', epoch: 1045, source: 'jpool' }
    vi.mocked(fetch).mockReturnValue(jsonResponse(verdict))
    const { fetchJpoolEligibility } = await loadModules()

    await expect(fetchJpoolEligibility(VOTE, 'mainnet')).resolves.toEqual(verdict)
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe(
      `https://backend.example/api/jpool/eligibility?vote=${VOTE}&network=mainnet`
    )
  })

  it.each([
    ['HTTP 500', () => jsonResponse({ code: 'JPOOL_ELIGIBILITY_FAILED' }, 500)],
    ['HTTP 400', () => jsonResponse({ code: 'JPOOL_MAINNET_ONLY' }, 400)],
    ['network error', () => Promise.reject(new TypeError('Failed to fetch'))],
    ['unexpected body', () => jsonResponse({ ok: true })],
  ])('fails open on %s', async (_label, impl) => {
    vi.mocked(fetch).mockImplementation(impl)
    const { fetchJpoolEligibility } = await loadModules()

    await expect(fetchJpoolEligibility(VOTE, 'mainnet')).resolves.toEqual({
      eligible: true,
      reason: null,
      epoch: null,
      source: 'fallback',
      clientFallback: 'error',
    })
  })

  it('fails open after 2 s', async () => {
    vi.useFakeTimers()
    try {
      vi.stubGlobal('fetch', hangingFetch())
      const { fetchJpoolEligibility, JPOOL_ELIGIBILITY_TIMEOUT_MS } = await loadModules()
      expect(JPOOL_ELIGIBILITY_TIMEOUT_MS).toBe(2_000)

      const pending = fetchJpoolEligibility(VOTE, 'mainnet')
      await vi.advanceTimersByTimeAsync(1_999)
      let settled = false
      void pending.then(() => (settled = true))
      await Promise.resolve()
      expect(settled).toBe(false)

      await vi.advanceTimersByTimeAsync(1)
      await expect(pending).resolves.toMatchObject({
        eligible: true,
        source: 'fallback',
        clientFallback: 'timeout',
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('rejects when the caller aborts, so late results can be dropped', async () => {
    vi.stubGlobal('fetch', hangingFetch())
    const { fetchJpoolEligibility } = await loadModules()
    const controller = new AbortController()

    const pending = fetchJpoolEligibility(VOTE, 'mainnet', { signal: controller.signal })
    controller.abort(new Error('unmounted'))
    await expect(pending).rejects.toThrow('unmounted')
  })

  it('rejects at once for an already aborted signal', async () => {
    const { fetchJpoolEligibility } = await loadModules()
    const controller = new AbortController()
    controller.abort(new Error('gone'))

    await expect(
      fetchJpoolEligibility(VOTE, 'mainnet', { signal: controller.signal })
    ).rejects.toThrow('gone')
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('getJpoolErrorText', () => {
  it.each([
    [
      'JPOOL_DEPOSITS_RESTRICTED',
      'Deposits to JPool are paused right now. Please try again later.',
    ],
    ['TRANSACTION_EXPIRED', 'The transaction expired before it was sent. Please try again.'],
    [
      'TRANSACTION_INSUFFICIENT_FUNDS',
      'Insufficient SOL balance to cover this deposit and network fees.',
    ],
    [
      'TRANSACTION_SEND_FAILED',
      'The transaction could not be confirmed as sent. Check your wallet activity before trying again.',
    ],
  ])('maps %s', async (code, text) => {
    const { getJpoolErrorText, BackendRequestError } = await loadModules()
    expect(getJpoolErrorText(new BackendRequestError('x', { status: 400, code }))).toBe(text)
  })

  it('falls back for unknown codes and non-backend errors', async () => {
    const { getJpoolErrorText, BackendRequestError, JPOOL_DEPOSIT_FAILED_TEXT } =
      await loadModules()
    expect(getJpoolErrorText(new BackendRequestError('x', { status: 500, code: 'NEW' }))).toBe(
      JPOOL_DEPOSIT_FAILED_TEXT
    )
    expect(getJpoolErrorText(new Error('wallet rejected'))).toBe(JPOOL_DEPOSIT_FAILED_TEXT)
  })
})

describe('direct-stake registration helpers', () => {
  const record = (id: string | null, poolTokenAmount = '1') => ({
    id,
    voteId: VOTE,
    poolTokenAmount,
    balanceAmount: '1',
    availableAmount: '1',
    createdAt: '2026-09-29T00:00:00.000Z',
  })

  it('treats unknown records as no baseline', async () => {
    const { directStakeKeys } = await loadModules()
    expect(directStakeKeys(null)).toBeNull()
    expect(directStakeKeys({ directStakes: null } as never)).toBeNull()
    expect(directStakeKeys({ directStakes: [] } as never)).toEqual(new Set())
  })

  it('detects a new record by id, or by content when ids are missing', async () => {
    const { directStakeKeys, hasNewDirectStake } = await loadModules()
    const before = directStakeKeys({ directStakes: [record('1'), record(null, '5')] } as never)!
    expect(
      hasNewDirectStake(before, { directStakes: [record('1'), record(null, '5')] } as never)
    ).toBe(false)
    expect(hasNewDirectStake(before, { directStakes: [record('1'), record('2')] } as never)).toBe(
      true
    )
    expect(hasNewDirectStake(before, { directStakes: [record(null, '6')] } as never)).toBe(true)
    expect(hasNewDirectStake(before, { directStakes: null } as never)).toBe(false)
  })
})

describe('jpoolAtaRentLamports', () => {
  it('reads the live rent and falls back to null', async () => {
    const { jpoolAtaRentLamports } = await loadModules()
    expect(jpoolAtaRentLamports({ ataRentLamports: '1488440' } as never)).toBe(BigInt(1_488_440))
    expect(jpoolAtaRentLamports({ ataRentLamports: null } as never)).toBeNull()
    // a pool response cached before the field existed
    expect(jpoolAtaRentLamports({} as never)).toBeNull()
    expect(jpoolAtaRentLamports({ ataRentLamports: '-1' } as never)).toBeNull()
    expect(jpoolAtaRentLamports(null)).toBeNull()
  })
})

describe('wallet binding helpers', () => {
  // On-curve test wallet from backend/test/fixtures/jpool-bind.json.
  const BIND_WALLET = '6vCSEqLYhE88vyppdpi7wa3aVbZhKffuAFcQhwqFfV3'
  // JPool's withdraw authority: a PDA, so off-curve.
  const PDA = 'HbJTxftxnXgpePCshA8FubsRj9MW4kfPscfuUfn44fnt'

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('builds the exact compact message JPool signs', async () => {
    const { buildJpoolBindMessage } = await loadModules()
    expect(buildJpoolBindMessage(BIND_WALLET, VOTE, 1790956418243)).toBe(
      '{"wallet":"6vCSEqLYhE88vyppdpi7wa3aVbZhKffuAFcQhwqFfV3","action":"bindWallet",' +
        '"voteId":"DeEpSdaw8uBLQ5T2HQhDf8fBSVbm13jGqJwoSF3HTpL5","timestamp":1790956418243}'
    )
  })

  it('detects whether an account can bind', async () => {
    const { getJpoolBindCapability } = await loadModules()
    const features = ['solana:signAndSendTransaction', 'solana:signMessage'] as const
    expect(getJpoolBindCapability({ address: BIND_WALLET, features })).toBe('supported')
    expect(
      getJpoolBindCapability({ address: BIND_WALLET, features: ['solana:signTransaction'] })
    ).toBe('no_sign_message')
    expect(getJpoolBindCapability({ address: PDA, features })).toBe('off_curve')
  })

  it('posts the bind request and returns the result', async () => {
    const { bindJpoolWallet } = await loadModules()
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockReturnValueOnce(
      jsonResponse({ success: true, alreadyBound: true, voteId: VOTE })
    )
    const request = { wallet: BIND_WALLET, signature: 'c2ln', message: '{}' }

    await expect(bindJpoolWallet('mainnet', request)).resolves.toEqual({
      success: true,
      alreadyBound: true,
      voteId: VOTE,
    })
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/jpool/bind?network=mainnet')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual(request)
  })

  it('exposes boundTo and retryAfterSeconds from bind errors', async () => {
    const { bindJpoolWallet, jpoolBoundToVoteId, jpoolRetryAfterSeconds, BackendRequestError } =
      await loadModules()
    const fetchMock = vi.mocked(fetch)
    const request = { wallet: BIND_WALLET, signature: 'c2ln', message: '{}' }

    fetchMock.mockReturnValueOnce(
      jsonResponse(
        { error: 'bound', code: 'JPOOL_BOUND_ELSEWHERE', boundTo: { voteId: PDA } },
        409
      )
    )
    const elsewhere = await bindJpoolWallet('mainnet', request).catch((error) => error)
    expect(elsewhere).toBeInstanceOf(BackendRequestError)
    expect(elsewhere.code).toBe('JPOOL_BOUND_ELSEWHERE')
    expect(jpoolBoundToVoteId(elsewhere)).toBe(PDA)

    fetchMock.mockReturnValueOnce(
      jsonResponse({ error: 'slow down', code: 'JPOOL_RATE_LIMITED', retryAfterSeconds: 42 }, 429)
    )
    const limited = await bindJpoolWallet('mainnet', request).catch((error) => error)
    expect(jpoolRetryAfterSeconds(limited)).toBe(42)
    expect(jpoolBoundToVoteId(limited)).toBeNull()
    expect(jpoolRetryAfterSeconds(new Error('x'))).toBeNull()
  })

  it('maps bind error codes to text', async () => {
    const { getJpoolBindErrorText, JPOOL_BIND_LATER_TEXT } = await loadModules()
    expect(getJpoolBindErrorText('JPOOL_BIND_EXPIRED')).toMatch(/expired/)
    expect(getJpoolBindErrorText('JPOOL_RATE_LIMITED', 42)).toContain('42 seconds')
    expect(getJpoolBindErrorText('JPOOL_RATE_LIMITED')).toContain('in a minute')
    expect(getJpoolBindErrorText('JPOOL_UNAVAILABLE')).toContain(JPOOL_BIND_LATER_TEXT)
    expect(getJpoolBindErrorText('JPOOL_BIND_REJECTED')).toContain('did not accept')
    expect(getJpoolBindErrorText('SOMETHING_NEW')).toBe(JPOOL_BIND_LATER_TEXT)
    expect(getJpoolBindErrorText(undefined)).toBe(JPOOL_BIND_LATER_TEXT)
  })
})

describe('BackendRequestError body', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('keeps the parsed object body and the existing fields', async () => {
    const { fetchJpoolPool, BackendRequestError } = await loadModules()
    vi.mocked(fetch).mockReturnValueOnce(
      jsonResponse({ error: 'nope', code: 'JPOOL_MAINNET_ONLY', extra: 1 }, 400)
    )
    const error = await fetchJpoolPool('devnet').catch((e) => e)
    expect(error).toBeInstanceOf(BackendRequestError)
    expect(error).toMatchObject({ status: 400, code: 'JPOOL_MAINNET_ONLY', message: 'nope' })
    expect(error.body).toEqual({ error: 'nope', code: 'JPOOL_MAINNET_ONLY', extra: 1 })
  })

  it('leaves the body undefined for non-object payloads', async () => {
    const { fetchJpoolPool } = await loadModules()
    vi.mocked(fetch).mockReturnValueOnce(jsonResponse(['x'], 500))
    const error = await fetchJpoolPool('mainnet').catch((e) => e)
    expect(error.body).toBeUndefined()
  })
})
