import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getConfiguredNetwork,
  getCurrentChain,
  getExplorerAccountUrl,
  getExplorerTxUrl,
} from './config';

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

describe('per-widget network helpers', () => {
  it('reports the wallet chain for the given network', () => {
    expect(getCurrentChain('devnet')).toBe('solana:devnet');
    expect(getCurrentChain('mainnet')).toBe('solana:mainnet');
  });

  it('ignores the build environment once a network is passed', () => {
    vi.stubEnv('VITE_NEXT_PUBLIC_NETWORK_ENV', 'devnet');
    expect(getCurrentChain('mainnet')).toBe('solana:mainnet');
    expect(
      getExplorerTxUrl({ signature: 'sig', explorer: 'solscan', network: 'mainnet' })
    ).toBe('https://solscan.io/tx/sig');
  });

  it('falls back to mainnet for an unknown network', () => {
    expect(getCurrentChain('testnet')).toBe('solana:mainnet');
  });

  it.each([
    ['solana-explorer', 'https://explorer.solana.com/tx/sig'],
    ['solscan', 'https://solscan.io/tx/sig'],
    ['orbmarkets', 'https://orbmarkets.io/tx/sig'],
  ] as const)('builds %s transaction links for each cluster', (explorer, base) => {
    expect(getExplorerTxUrl({ signature: 'sig', explorer, network: 'mainnet' })).toBe(base);
    expect(getExplorerTxUrl({ signature: 'sig', explorer, network: 'devnet' })).toBe(
      `${base}?cluster=devnet`
    );
  });

  it.each([
    ['solana-explorer', 'https://explorer.solana.com/address/acc'],
    ['solscan', 'https://solscan.io/account/acc'],
    ['orbmarkets', 'https://orbmarkets.io/account/acc'],
  ] as const)('builds %s account links for each cluster', (explorer, base) => {
    expect(getExplorerAccountUrl({ account: 'acc', explorer, network: 'mainnet' })).toBe(base);
    expect(getExplorerAccountUrl({ account: 'acc', explorer, network: 'devnet' })).toBe(
      `${base}?cluster=devnet`
    );
  });
});
