import {
  getWalletDataCache,
  type WalletCacheRecord,
  type WalletDataCache,
  type WalletDataResource
} from "./cache";
import {
  recordWalletCacheOperation,
  observeWalletCacheRefresh
} from "../observability/metrics";

export interface WalletCachePolicy {
  freshMs: number;
  staleMs: number;
}

export const WALLET_CACHE_POLICIES = {
  native: { freshMs: 2 * 60_000, staleMs: 30 * 60_000 },
  blaze: { freshMs: 2 * 60_000, staleMs: 30 * 60_000 },
  vault: { freshMs: 60_000, staleMs: 10 * 60_000 },
  vaultUpdating: { freshMs: 10_000, staleMs: 60_000 }
} as const satisfies Record<string, WalletCachePolicy>;

interface GetWalletDataOptions<T> {
  resource: WalletDataResource;
  network: string;
  wallet: string;
  fetcher: () => Promise<T>;
  policy: WalletCachePolicy | ((data: T) => WalletCachePolicy);
  forceRefresh?: boolean;
  cache?: WalletDataCache | null;
  now?: () => number;
}

const inFlight = new Map<string, Promise<unknown>>();
const LOCK_TTL_MS = 15_000;

function requestKey(
  resource: WalletDataResource,
  network: string,
  wallet: string
): string {
  return `${resource}:${network}:${wallet}`;
}

function resolvePolicy<T>(
  policy: GetWalletDataOptions<T>["policy"],
  data: T
): WalletCachePolicy {
  return typeof policy === "function" ? policy(data) : policy;
}

async function cacheRead<T>(
  cache: WalletDataCache | null,
  resource: WalletDataResource,
  network: string,
  wallet: string
): Promise<WalletCacheRecord<T> | null> {
  if (!cache) return null;
  try {
    const record = await cache.read<T>(resource, network, wallet);
    recordWalletCacheOperation(
      resource,
      "read",
      record ? "hit" : "miss",
      network
    );
    return record;
  } catch (error) {
    recordWalletCacheOperation(resource, "read", "error", network);
    console.warn("Wallet data cache read failed", {
      resource,
      network,
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

async function refresh<T>(
  options: GetWalletDataOptions<T>,
  cache: WalletDataCache | null,
  skipIfLocked = false
): Promise<T> {
  const key = requestKey(options.resource, options.network, options.wallet);
  const existing = inFlight.get(key);
  if (existing) {
    recordWalletCacheOperation(
      options.resource,
      "refresh",
      "coalesced",
      options.network
    );
    return existing as Promise<T>;
  }

  const operation = (async () => {
    const startedAt = Date.now();
    let token: string | null = null;
    let lockFailed = false;
    try {
      if (cache) {
        try {
          token = await cache.acquireLock(
            options.resource,
            options.network,
            options.wallet,
            LOCK_TTL_MS
          );
        } catch {
          lockFailed = true;
          recordWalletCacheOperation(
            options.resource,
            "lock",
            "error",
            options.network
          );
        }
        if (!token && !lockFailed && skipIfLocked) {
          recordWalletCacheOperation(
            options.resource,
            "lock",
            "contended",
            options.network
          );
          const latest = await cacheRead<T>(
            cache,
            options.resource,
            options.network,
            options.wallet
          );
          if (latest) return latest.data;
        }
      }

      const data = await options.fetcher();
      const now = (options.now ?? Date.now)();
      const policy = resolvePolicy(options.policy, data);
      const record: WalletCacheRecord<T> = {
        version: 1,
        cachedAt: now,
        freshUntil: now + policy.freshMs,
        staleUntil: now + policy.staleMs,
        data
      };

      if (cache) {
        try {
          await cache.write(
            options.resource,
            options.network,
            options.wallet,
            record
          );
          recordWalletCacheOperation(
            options.resource,
            "write",
            "success",
            options.network
          );
        } catch (error) {
          recordWalletCacheOperation(
            options.resource,
            "write",
            "error",
            options.network
          );
          console.warn("Wallet data cache write failed", {
            resource: options.resource,
            network: options.network,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
      observeWalletCacheRefresh(
        options.resource,
        "success",
        options.network,
        Date.now() - startedAt
      );
      return data;
    } catch (error) {
      observeWalletCacheRefresh(
        options.resource,
        "error",
        options.network,
        Date.now() - startedAt
      );
      throw error;
    } finally {
      if (cache && token) {
        try {
          await cache.releaseLock(
            options.resource,
            options.network,
            options.wallet,
            token
          );
        } catch {
          recordWalletCacheOperation(
            options.resource,
            "unlock",
            "error",
            options.network
          );
        }
      }
    }
  })().finally(() => inFlight.delete(key));

  inFlight.set(key, operation);
  return operation;
}

export async function getWalletData<T>(
  options: GetWalletDataOptions<T>
): Promise<T> {
  const cache =
    options.cache === undefined ? getWalletDataCache() : options.cache;
  const now = (options.now ?? Date.now)();

  if (!options.forceRefresh) {
    const record = await cacheRead<T>(
      cache,
      options.resource,
      options.network,
      options.wallet
    );
    if (record && now <= record.freshUntil) {
      recordWalletCacheOperation(
        options.resource,
        "lookup",
        "fresh",
        options.network
      );
      return record.data;
    }
    if (record && now <= record.staleUntil) {
      recordWalletCacheOperation(
        options.resource,
        "lookup",
        "stale",
        options.network
      );
      void refresh(options, cache, true).catch((error) => {
        console.warn("Wallet data background refresh failed", {
          resource: options.resource,
          network: options.network,
          error: error instanceof Error ? error.message : String(error)
        });
      });
      return record.data;
    }
  } else {
    recordWalletCacheOperation(
      options.resource,
      "lookup",
      "bypass",
      options.network
    );
  }

  return refresh(options, cache);
}

export async function invalidateWalletData(
  resource: WalletDataResource,
  network: string,
  wallet: string
): Promise<boolean> {
  const cache = getWalletDataCache();
  if (!cache) return false;
  try {
    await cache.delete(resource, network, wallet);
    recordWalletCacheOperation(resource, "delete", "success", network);
    return true;
  } catch (error) {
    recordWalletCacheOperation(resource, "delete", "error", network);
    console.warn("Wallet data cache invalidation failed", {
      resource,
      network,
      error: error instanceof Error ? error.message : String(error)
    });
    return false;
  }
}
