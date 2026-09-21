import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LEGACY_WALLET_SELECTION_KEY,
  WALLET_SELECTION_KEY,
  readWalletSelection,
  saveWalletSelection,
} from './walletSelectionStorage';

beforeEach(() => localStorage.clear());

describe('wallet selection storage', () => {
  it('migrates a saved legacy selection once', () => {
    localStorage.setItem(LEGACY_WALLET_SELECTION_KEY, 'Wallet:Address');
    expect(readWalletSelection()).toBe('Wallet:Address');
    expect(localStorage.getItem(WALLET_SELECTION_KEY)).toBe('Wallet:Address');
    expect(localStorage.getItem(LEGACY_WALLET_SELECTION_KEY)).toBeNull();
  });

  it('prefers the new key and clears both keys on disconnect', () => {
    localStorage.setItem(LEGACY_WALLET_SELECTION_KEY, 'Old:Address');
    localStorage.setItem(WALLET_SELECTION_KEY, 'New:Address');
    expect(readWalletSelection()).toBe('New:Address');
    saveWalletSelection(undefined);
    expect(localStorage.getItem(WALLET_SELECTION_KEY)).toBeNull();
    expect(localStorage.getItem(LEGACY_WALLET_SELECTION_KEY)).toBeNull();
  });

  it('keeps selection usable when storage writes fail', () => {
    localStorage.setItem(LEGACY_WALLET_SELECTION_KEY, 'Wallet:Address');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied') });
    expect(readWalletSelection()).toBe('Wallet:Address');
    expect(localStorage.getItem(LEGACY_WALLET_SELECTION_KEY)).toBe('Wallet:Address');
    expect(() => saveWalletSelection('Wallet:Address')).not.toThrow();
  });
});
