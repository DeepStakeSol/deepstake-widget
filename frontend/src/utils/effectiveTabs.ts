import type { WidgetTab } from '../options'
import type { NetworkType } from './config'

// Every tab `data-options.tabs` may name, in display order.
export const SUPPORTED_WIDGET_TABS: readonly WidgetTab[] = ['native', 'blaze', 'vault', 'jpool']
// Tabs shown when `tabs` is missing or names nothing valid. JPool is opt-in
// until 2.0.0 (J3 adds it here).
export const DEFAULT_WIDGET_TABS: readonly WidgetTab[] = ['native', 'blaze', 'vault']
// Tabs dropped (with a console warning) on devnet.
export const MAINNET_ONLY_WIDGET_TABS: readonly WidgetTab[] = ['vault', 'jpool']

export const WIDGET_TAB_NAMES: Record<WidgetTab, string> = {
  native: 'Native',
  blaze: 'BlazeStake',
  vault: 'Vault',
  jpool: 'JPool',
}

const SUPPORTED_TAB_IDS = new Set<WidgetTab>(SUPPORTED_WIDGET_TABS)

export function isWidgetTab(value: unknown): value is WidgetTab {
  return typeof value === 'string' && SUPPORTED_TAB_IDS.has(value as WidgetTab)
}

export type EffectiveTabs = {
  tabs: WidgetTab[]
  // Requested mainnet-only tabs removed because the widget runs on devnet.
  devnetHidden: WidgetTab[]
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
      ? [...DEFAULT_WIDGET_TABS]
      : SUPPORTED_WIDGET_TABS.filter((tab) => enabledTabIds.has(tab))
  const devnetHidden =
    network === 'devnet'
      ? requestedTabs.filter((tab) => MAINNET_ONLY_WIDGET_TABS.includes(tab))
      : []
  const effectiveTabs = requestedTabs.filter((tab) => !devnetHidden.includes(tab))

  return {
    tabs: effectiveTabs,
    devnetHidden,
    invalidConfiguration:
      network === 'devnet' &&
      hasExplicitTabs &&
      enabledTabIds.size > 0 &&
      effectiveTabs.length === 0,
  }
}

// "Vault", "Vault and JPool"
export function formatTabNames(tabs: readonly WidgetTab[]): string {
  const names = tabs.map((tab) => WIDGET_TAB_NAMES[tab])
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names.join('')
}
