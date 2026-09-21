export const WALLET_SELECTION_KEY = 'deepstake:selected-wallet';
export const LEGACY_WALLET_SELECTION_KEY = 'qn-solana-staking:selected-wallet-and-address';

export function readWalletSelection(): string | null {
  try {
    const current = localStorage.getItem(WALLET_SELECTION_KEY);
    if (current !== null) return current;

    const legacy = localStorage.getItem(LEGACY_WALLET_SELECTION_KEY);
    if (legacy !== null) {
      try {
        localStorage.setItem(WALLET_SELECTION_KEY, legacy);
        localStorage.removeItem(LEGACY_WALLET_SELECTION_KEY);
      } catch {
        // Keep the legacy value so the selection can still be restored.
      }
    }
    return legacy;
  } catch {
    return null;
  }
}

export function saveWalletSelection(value: string | undefined): void {
  if (value) {
    try {
      localStorage.setItem(WALLET_SELECTION_KEY, value);
      localStorage.removeItem(LEGACY_WALLET_SELECTION_KEY);
    } catch {
      // A storage failure must not prevent selecting a wallet in memory.
    }
    return;
  }

  for (const key of [WALLET_SELECTION_KEY, LEGACY_WALLET_SELECTION_KEY]) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Continue clearing the other key if one operation fails.
    }
  }
}
