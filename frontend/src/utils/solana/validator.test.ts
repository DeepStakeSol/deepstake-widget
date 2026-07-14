import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchValidatorInfo, fetchValidatorLogo } from './validator'

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response
}

describe('validator data', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('normalizes the Stakewiz response to the widget profile', async () => {
    vi.mocked(fetch).mockResolvedValue(
      response({
        vote_identity: 'returned-vote',
        name: 'Validator',
        description: 'Description',
        total_apy: 7.5,
        commission: 0,
        is_jito: true,
        jito_commission_bps: 250,
      })
    )

    await expect(fetchValidatorInfo('configured-vote')).resolves.toEqual({
      voteAccount: 'returned-vote',
      name: 'Validator',
      description: 'Description',
      estimatedApyPercent: 7.5,
      commissionPercent: 0,
      mevEnabled: true,
      mevCommissionPercent: 2.5,
    })
  })

  it('uses null for missing or malformed optional values', async () => {
    vi.mocked(fetch).mockResolvedValue(
      response({
        name: '',
        total_apy: '7.5',
        commission: null,
        is_jito: 'true',
      })
    )

    await expect(fetchValidatorInfo('configured-vote')).resolves.toEqual({
      voteAccount: 'configured-vote',
      name: null,
      description: null,
      estimatedApyPercent: null,
      commissionPercent: null,
      mevEnabled: null,
      mevCommissionPercent: null,
    })
  })

  it('throws for a failed Stakewiz response', async () => {
    vi.mocked(fetch).mockResolvedValue(response({}, 503))

    await expect(fetchValidatorInfo('vote')).rejects.toThrow('HTTP error! status: 503')
  })

  it('selects a matching Trillium logo and ignores malformed URLs', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        response([{ vote_account_pubkey: 'vote', icon_url: 'https://logo.example/logo.png' }])
      )
      .mockResolvedValueOnce(response([{ vote_account_pubkey: 'vote', icon_url: 42 }]))

    await expect(fetchValidatorLogo('vote')).resolves.toBe('https://logo.example/logo.png')
    await expect(fetchValidatorLogo('vote')).resolves.toBeNull()
  })
})
