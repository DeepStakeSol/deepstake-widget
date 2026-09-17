import { address } from '@solana/kit'
import { Options, WidgetTab } from '../options'

const VALID_TABS = new Set<WidgetTab>(['native', 'blaze', 'vault'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isWidgetTab(value: unknown): value is WidgetTab {
  return typeof value === 'string' && VALID_TABS.has(value as WidgetTab)
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

export function parseWidgetOptions(rawOptions: string | undefined): Options {
  let parsed: unknown

  try {
    parsed = JSON.parse(rawOptions || '{}')
  } catch (error) {
    throw new Error('data-options must contain valid JSON', { cause: error })
  }

  if (!isRecord(parsed)) {
    throw new Error('data-options must contain a JSON object')
  }

  if (typeof parsed.vote_account !== 'string' || parsed.vote_account.length === 0) {
    throw new Error('vote_account is required')
  }

  try {
    address(parsed.vote_account)
  } catch (error) {
    throw new Error('vote_account must be a valid Solana address', { cause: error })
  }

  if (parsed.network !== undefined && parsed.network !== 'mainnet' && parsed.network !== 'devnet') {
    throw new Error('network must be either "mainnet" or "devnet"')
  }

  const options: Options = {
    vote_account: parsed.vote_account,
    theme: parsed.theme === 'light' ? 'light' : 'dark',
  }

  if (parsed.network === 'mainnet' || parsed.network === 'devnet') {
    options.network = parsed.network
  }

  if (Array.isArray(parsed.tabs)) {
    options.tabs = parsed.tabs.filter(isWidgetTab)
  }

  const validatorName = optionalString(parsed.validator_name)
  const validatorDescription = optionalString(parsed.validator_description)
  const validatorLogoUrl = optionalString(parsed.validator_logo_url)
  if (validatorName !== undefined) options.validator_name = validatorName
  if (validatorDescription !== undefined) {
    options.validator_description = validatorDescription
  }
  if (validatorLogoUrl !== undefined) options.validator_logo_url = validatorLogoUrl

  return options
}
