import { GetStakeAccountResponse } from "../utils/solana/stake/get-stake-accounts";

/** Time-to-live for the stake accounts cache, in milliseconds. */
export const STAKE_ACCOUNTS_CACHE_TTL_MS = 300_000; // 30 seconds

interface CacheEntry {
  data: GetStakeAccountResponse[];
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

/**
 * Build a deterministic cache key from the owner address and network.
 */
function cacheKey(owner: string, network: string): string {
  return `${network}:${owner}`;
}

/**
 * Return cached stake accounts if a valid (non-expired) entry exists.
 * Returns `null` when the cache is empty or expired.
 */
export function getCachedStakeAccounts(
  owner: string,
  network: string
): GetStakeAccountResponse[] | null {
  const entry = cache.get(cacheKey(owner, network));
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(cacheKey(owner, network));
    return null;
  }
  return entry.data;
}

/**
 * Store stake accounts in the cache with a TTL.
 */
export function setCachedStakeAccounts(
  owner: string,
  network: string,
  data: GetStakeAccountResponse[]
): void {
  cache.set(cacheKey(owner, network), {
    data,
    expiresAt: Date.now() + STAKE_ACCOUNTS_CACHE_TTL_MS,
  });
}

/**
 * Invalidate the cache for a specific owner/network pair.
 */
export function invalidateStakeAccountsCache(
  owner: string,
  network: string
): void {
  cache.delete(cacheKey(owner, network));
}

/**
 * Invalidate all cached stake accounts.
 */
export function clearStakeAccountsCache(): void {
  cache.clear();
}
