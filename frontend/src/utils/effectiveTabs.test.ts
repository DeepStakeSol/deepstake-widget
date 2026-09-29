import { describe, expect, it } from 'vitest'

import {
  DEFAULT_WIDGET_TABS,
  formatTabNames,
  getEffectiveTabs,
  isWidgetTab,
  SUPPORTED_WIDGET_TABS,
} from './effectiveTabs'

describe('getEffectiveTabs', () => {
  it('keeps JPool opt-in: the default stays three tabs', () => {
    expect(DEFAULT_WIDGET_TABS).toEqual(['native', 'blaze', 'vault'])
    expect(getEffectiveTabs(undefined, 'mainnet').tabs).toEqual(['native', 'blaze', 'vault'])
    expect(getEffectiveTabs([], 'mainnet').tabs).toEqual(['native', 'blaze', 'vault'])
    expect(getEffectiveTabs(['bogus' as never], 'mainnet').tabs).toEqual(DEFAULT_WIDGET_TABS)
  })

  it('accepts JPool when requested, in display order', () => {
    expect(SUPPORTED_WIDGET_TABS).toEqual(['native', 'blaze', 'vault', 'jpool'])
    expect(getEffectiveTabs(['jpool', 'native', 'vault', 'blaze'], 'mainnet')).toEqual({
      tabs: ['native', 'blaze', 'vault', 'jpool'],
      devnetHidden: [],
      invalidConfiguration: false,
    })
  })

  it('hides Vault and JPool on devnet', () => {
    expect(getEffectiveTabs(['native', 'vault', 'jpool'], 'devnet')).toEqual({
      tabs: ['native'],
      devnetHidden: ['vault', 'jpool'],
      invalidConfiguration: false,
    })
    expect(getEffectiveTabs(undefined, 'devnet').devnetHidden).toEqual(['vault'])
  })

  it('flags a devnet config with only mainnet-only tabs', () => {
    expect(getEffectiveTabs(['jpool'], 'devnet')).toEqual({
      tabs: [],
      devnetHidden: ['jpool'],
      invalidConfiguration: true,
    })
  })
})

describe('tab helpers', () => {
  it('recognizes supported tab ids only', () => {
    expect(isWidgetTab('jpool')).toBe(true)
    expect(isWidgetTab('marinade')).toBe(false)
    expect(isWidgetTab(1)).toBe(false)
  })

  it('formats hidden tab names for messages', () => {
    expect(formatTabNames(['vault'])).toBe('Vault')
    expect(formatTabNames(['vault', 'jpool'])).toBe('Vault and JPool')
    expect(formatTabNames(['native', 'vault', 'jpool'])).toBe('Native, Vault and JPool')
  })
})
