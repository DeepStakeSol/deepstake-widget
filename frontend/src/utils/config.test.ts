import { afterEach, describe, expect, it, vi } from 'vitest';
import { getConfiguredNetwork } from './config';

afterEach(() => vi.unstubAllEnvs());

describe('network selection', () => {
  it('defaults to mainnet when no network is configured', () => {
    vi.stubEnv('VITE_NEXT_PUBLIC_NETWORK_ENV', '');
    expect(getConfiguredNetwork()).toBe('mainnet');
  });

  it('prefers the embed option over the build environment', () => {
    vi.stubEnv('VITE_NEXT_PUBLIC_NETWORK_ENV', 'devnet');
    expect(getConfiguredNetwork({ vote_account: 'vote', network: 'mainnet', theme: 'dark' })).toBe('mainnet');
  });

  it('uses the build environment when the embed option is omitted', () => {
    vi.stubEnv('VITE_NEXT_PUBLIC_NETWORK_ENV', 'devnet');
    expect(getConfiguredNetwork()).toBe('devnet');
  });
});
