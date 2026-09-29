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
  vaultUpdating: { freshMs: 10_000, staleMs: 60_000 },
  jpool: { freshMs: 60_000, staleMs: 10 * 60_000 },
  // After a deposit the JPool indexer needs a few seconds to register it, and
  // partial upstream failures should not be served for long.
  jpoolRecent: { freshMs: 10_000, staleMs: 60_000 }
} as const satisfies Record<string, WalletCachePolicy>;

// Resources whose invalidation is a wallet-level marker instead of a DEL,
// because their records are split by scope (one record per vote account).
const MARKER_INVALIDATED_RESOURCES: ReadonlySet<WalletDataResource> = new Set([
  "jpool-manage"
]);
// How long after a mutation `recentlyMutated` is reported to policies.
export const RECENT_MUTATION_WINDOW_MS = 60_000;
// The marker must outlive every record cached before it; otherwise an old
// record becomes servable again when the marker expires.
const MUTATION_MARKER_TTL_MS = WALLET_CACHE_POLICIES.jpool.staleMs;

export interface WalletPolicyContext {
  recentlyMutated: boolean;
}

interface GetWalletDataOptions<T> {
  resource: WalletDataResource;
  network: string;
  wallet: string;
  // Extra key segment for resources cached per wallet and per something else.
  scope?: string;
  fetcher: () => Promise<T>;
  policy:
    | WalletCachePolicy
    | ((data: T, context: WalletPolicyContext) => WalletCachePolicy);
  forceRefresh?: boolean;
  cache?: WalletDataCache | null;
  now?: () => number;
}

const inFlight = new Map<string, Promise<unknown>>();
const LOCK_TTL_MS = 15_000;

function requestKey(
  resource: WalletDataResource,
  network: string,
  wallet: string,
  scope?: string
): string {
  return scope === undefined
    ? `${resource}:${network}:${wallet}`
    : `${resource}:${network}:${wallet}:${scope}`;
}

function resolvePolicy<T>(
  policy: GetWalletDataOptions<T>["policy"],
  data: T,
  context: WalletPolicyContext
): WalletCachePolicy {
  return typeof policy === "function" ? policy(data, context) : policy;
}

async function readMutationMarker(
  cache: WalletDataCache | null,
  resource: WalletDataResource,
  network: string,
  wallet: string
): Promise<number | null> {
  if (!cache || !MARKER_INVALIDATED_RESOURCES.has(resource)) return null;
  try {
    return await cache.readMutation(resource, network, wallet);
  } catch (error) {
    recordWalletCacheOperation(resource, "marker", "error", network);
    console.warn("Wallet data mutation marker read failed", {
      resource,
      network,
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

async function cacheRead<T>(
  cache: WalletDataCache | null,
  resource: WalletDataResource,
  network: string,
  wallet: string,
  scope?: string
): Promise<WalletCacheRecord<T> | null> {
  if (!cache) return null;
  try {
    const record = await cache.read<T>(resource, network, wallet, scope);
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
  const key = requestKey(
    options.resource,
    options.network,
    options.wallet,
    options.scope
  );
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
            LOCK_TTL_MS,
            options.scope
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
            options.wallet,
            options.scope
          );
          if (latest) return latest.data;
        }
      }

      const fetchStartedAt = (options.now ?? Date.now)();
      const data = await options.fetcher();
      const now = (options.now ?? Date.now)();
      const mutatedAt = await readMutationMarker(
        cache,
        options.resource,
        options.network,
        options.wallet
      );
      const policy = resolvePolicy(options.policy, data, {
        recentlyMutated:
          mutatedAt !== null && now - mutatedAt < RECENT_MUTATION_WINDOW_MS
      });
      const record: WalletCacheRecord<T> = {
        version: 1,
        cachedAt: now,
        freshUntil: now + policy.freshMs,
        staleUntil: now + policy.staleMs,
        fetchStartedAt,
        data
      };

      if (cache) {
        try {
          await cache.write(
            options.resource,
            options.network,
            options.wallet,
            record,
            options.scope
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
            token,
            options.scope
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
    const [cached, mutatedAt] = await Promise.all([
      cacheRead<T>(
        cache,
        options.resource,
        options.network,
        options.wallet,
        options.scope
      ),
      readMutationMarker(cache, options.resource, options.network, options.wallet)
    ]);
    // A record whose fetch started before the last mutation is outdated.
    const outdated =
      cached !== null &&
      mutatedAt !== null &&
      (cached.fetchStartedAt ?? cached.cachedAt) <= mutatedAt;
    if (outdated) {
      recordWalletCacheOperation(
        options.resource,
        "lookup",
        "invalidated",
        options.network
      );
    }
    const record = outdated ? null : cached;
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
  wallet: string,
  cacheOverride?: WalletDataCache | null,
  now: () => number = Date.now
): Promise<boolean> {
  const cache =
    cacheOverride === undefined ? getWalletDataCache() : cacheOverride;
  if (!cache) return false;
  try {
    if (MARKER_INVALIDATED_RESOURCES.has(resource)) {
      await cache.markMutation(
        resource,
        network,
        wallet,
        now(),
        MUTATION_MARKER_TTL_MS
      );
    } else {
      await cache.delete(resource, network, wallet);
    }
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
