import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HIDE_OTHER_NETWORK_ALERT_KEY,
  hideOtherNetworkAlert,
  isOtherNetworkAlertHidden,
} from './networkAlertPreference';

beforeEach(() => localStorage.clear());

describe('other-network alert preference', () => {
  it('persists only the explicit opt-out', () => {
    expect(isOtherNetworkAlertHidden()).toBe(false);
    hideOtherNetworkAlert();
    expect(localStorage.getItem(HIDE_OTHER_NETWORK_ALERT_KEY)).toBe('1');
    expect(isOtherNetworkAlertHidden()).toBe(true);
  });

  it('tolerates unavailable storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied') });
    expect(isOtherNetworkAlertHidden()).toBe(false);
    expect(() => hideOtherNetworkAlert()).not.toThrow();
  });
});
