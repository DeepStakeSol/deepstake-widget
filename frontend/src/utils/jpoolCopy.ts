// User-facing JPool deposit texts (spec §8), kept out of the component file.
import { formatLamports } from './lamports'

export type JpoolRegistration = 'pending' | 'registered' | 'not_yet' | 'unknown'

export interface JpoolCompletion {
  signature: string
  expectedJsol: bigint
  registration: JpoolRegistration
}

export function jpoolRegistrationText(registration: JpoolRegistration, validatorName: string) {
  switch (registration) {
    case 'pending':
      return 'JPool usually registers a deposit within 5 minutes. Checking…'
    case 'registered':
      return `JPool has registered this deposit for ${validatorName}.`
    case 'not_yet':
      return "JPool hasn't registered this deposit yet. It will appear on the Manage tab within a few minutes."
    case 'unknown':
      return `Check the Manage tab shortly to see this deposit counted for ${validatorName}.`
  }
}

// TEMP(JPOOL-TMP-13): the success text shows the pre-send quote ("~X JSOL");
// the exact minted amount is only visible after a Manage refresh.
export function jpoolDepositText(completed: JpoolCompletion, validatorName: string) {
  return [
    `You received ~${formatLamports(completed.expectedJsol, 6)} JSOL.`,
    // TEMP(JPOOL-TMP-01): softened copy until JPool confirms the attribution policy.
    `Your deposit is tagged for ${validatorName} via JPool direct staking.`,
  ].join(' ')
}

// Post-deposit Bind step (spec §8).
export function jpoolBindPromptTitle(validatorName: string) {
  return `Bind your wallet to ${validatorName}?`
}

export function jpoolBindPromptText(validatorName: string) {
  return `Binding makes all JSOL in this wallet, now and in the future, count for ${validatorName}. Your wallet will ask you to sign a short message. Nothing is spent.`
}
