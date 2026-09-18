import type { WidgetTab } from '../options'
import type { NetworkType } from './config'

export const ALL_WIDGET_TABS: readonly WidgetTab[] = ['native', 'blaze', 'vault']

const VALID_TAB_IDS = new Set<WidgetTab>(ALL_WIDGET_TABS)

function isWidgetTab(value: unknown): value is WidgetTab {
  return typeof value === 'string' && VALID_TAB_IDS.has(value as WidgetTab)
}

export type EffectiveTabs = {
  tabs: WidgetTab[]
  vaultHidden: boolean
  invalidConfiguration: boolean
}

export function getEffectiveTabs(
  tabs: WidgetTab[] | undefined,
  network: NetworkType
): EffectiveTabs {
  const hasExplicitTabs = Array.isArray(tabs)
  const enabledTabIds = new Set(hasExplicitTabs ? tabs.filter(isWidgetTab) : [])
  const requestedTabs =
    !hasExplicitTabs || enabledTabIds.size === 0
      ? [...ALL_WIDGET_TABS]
      : ALL_WIDGET_TABS.filter((tab) => enabledTabIds.has(tab))
  const vaultHidden = network === 'devnet' && requestedTabs.includes('vault')
  const effectiveTabs = vaultHidden ? requestedTabs.filter((tab) => tab !== 'vault') : requestedTabs

  return {
    tabs: effectiveTabs,
    vaultHidden,
    invalidConfiguration:
      network === 'devnet' &&
      hasExplicitTabs &&
      enabledTabIds.size > 0 &&
      effectiveTabs.length === 0,
  }
}
