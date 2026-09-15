import { describe, expect, it } from 'vitest'
import { parseWidgetOptions } from './widgetOptions'

const VOTE_ACCOUNT = 'Vote111111111111111111111111111111111111111'

describe('parseWidgetOptions', () => {
  it('rejects malformed JSON and non-object values', () => {
    expect(() => parseWidgetOptions('{"vote_account": "broken",}')).toThrow(
      'data-options must contain valid JSON'
    )
    expect(() => parseWidgetOptions('null')).toThrow('data-options must contain a JSON object')
    expect(() => parseWidgetOptions('[]')).toThrow('data-options must contain a JSON object')
  })

  it('requires a valid Solana vote account address', () => {
    expect(() => parseWidgetOptions('{}')).toThrow('vote_account is required')
    expect(() => parseWidgetOptions('{"vote_account":"not-base58"}')).toThrow(
      'vote_account must be a valid Solana address'
    )
  })

  it('rejects an explicitly unsupported network', () => {
    expect(() =>
      parseWidgetOptions(JSON.stringify({ vote_account: VOTE_ACCOUNT, network: 'testnet' }))
    ).toThrow('network must be either "mainnet" or "devnet"')
  })

  it('normalizes soft fields and preserves current validator overrides', () => {
    expect(
      parseWidgetOptions(
        JSON.stringify({
          vote_account: VOTE_ACCOUNT,
          network: 'mainnet',
          theme: 'sepia',
          tabs: ['vault', 'unknown', 42, 'native'],
          validator_name: 'Validator',
          validator_description: 'Description',
          validator_logo_url: '/logo.png',
          ignored: 'value',
        })
      )
    ).toEqual({
      vote_account: VOTE_ACCOUNT,
      network: 'mainnet',
      theme: 'light',
      tabs: ['vault', 'native'],
      validator_name: 'Validator',
      validator_description: 'Description',
      validator_logo_url: '/logo.png',
    })
  })

  it('leaves network absent for the existing environment precedence', () => {
    expect(parseWidgetOptions(JSON.stringify({ vote_account: VOTE_ACCOUNT }))).toEqual({
      vote_account: VOTE_ACCOUNT,
      theme: 'light',
    })
  })

  it('ignores malformed tabs collections and accepts dark theme', () => {
    expect(
      parseWidgetOptions(
        JSON.stringify({
          vote_account: VOTE_ACCOUNT,
          theme: 'dark',
          tabs: 'native',
        })
      )
    ).toEqual({
      vote_account: VOTE_ACCOUNT,
      theme: 'dark',
    })
  })
})
