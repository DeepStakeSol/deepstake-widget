import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  WalletCacheRecord,
  WalletDataCache,
  WalletDataResource
} from "./cache";
import {
  getWalletData,
  invalidateWalletData,
  WALLET_CACHE_POLICIES
} from "./service";

// `record` is the unscoped slot; scoped records live in `scoped` by scope.
class MemoryCache implements WalletDataCache {
  record: WalletCacheRecord | null = null;
  scoped = new Map<string, WalletCacheRecord>();
  markers = new Map<string, { at: number; ttlMs: number }>();
  readError = false;
  markerError = false;
  writes = 0;
  deletes: string[] = [];
  async read<T>(
    _resource: WalletDataResource,
    _network: string,
    _wallet: string,
    scope?: string
  ): Promise<WalletCacheRecord<T> | null> {
    if (this.readError) throw new Error("redis down");
    const value =
      scope === undefined ? this.record : (this.scoped.get(scope) ?? null);
    return value as WalletCacheRecord<T> | null;
  }
  async write<T>(
    _resource: WalletDataResource,
    _network: string,
    _wallet: string,
    record: WalletCacheRecord<T>,
    scope?: string
  ) {
    if (scope === undefined) this.record = record;
    else this.scoped.set(scope, record);
    this.writes += 1;
  }
  async delete(resource: WalletDataResource) {
    this.deletes.push(resource);
    this.record = null;
  }
  async acquireLock() {
    return "token";
  }
  async releaseLock() {}
  async markMutation(
    resource: WalletDataResource,
    network: string,
    wallet: string,
    at: number,
    ttlMs: number
  ) {
    this.markers.set(`${resource}:${network}:${wallet}`, { at, ttlMs });
  }
  async readMutation(
    resource: WalletDataResource,
    network: string,
    wallet: string
  ) {
    if (this.markerError) throw new Error("redis down");
    return this.markers.get(`${resource}:${network}:${wallet}`)?.at ?? null;
  }
}

const base = {
  resource: "native-stake" as const,
  network: "mainnet",
  wallet: "wallet",
  policy: WALLET_CACHE_POLICIES.native
};

function record(
  data: unknown,
  freshUntil: number,
  staleUntil: number
): WalletCacheRecord {
  return { version: 1, cachedAt: 1, freshUntil, staleUntil, data };
}

describe("wallet data cache service", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("returns fresh cached data without calling the provider", async () => {
    const cache = new MemoryCache();
    cache.record = record([], 200, 300);
    const fetcher = vi.fn();

    await expect(
      getWalletData({ ...base, cache, now: () => 100, fetcher })
    ).resolves.toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("returns stale data immediately and refreshes it in the background", async () => {
    const cache = new MemoryCache();
    cache.record = record(["old"], 50, 300);
    const fetcher = vi.fn().mockResolvedValue(["new"]);

    await expect(
      getWalletData({ ...base, cache, now: () => 100, fetcher })
    ).resolves.toEqual(["old"]);
    await vi.waitFor(() => expect(cache.record?.data).toEqual(["new"]));
  });

  it("bypasses a fresh record when forceRefresh is true", async () => {
    const cache = new MemoryCache();
    cache.record = record(["old"], 200, 300);
    const fetcher = vi.fn().mockResolvedValue(["new"]);

    await expect(
      getWalletData({
        ...base,
        cache,
        now: () => 100,
        forceRefresh: true,
        fetcher
      })
    ).resolves.toEqual(["new"]);
    expect(cache.record?.data).toEqual(["new"]);
  });

  it("falls back to the provider when Redis reads fail and caches empty results", async () => {
    const cache = new MemoryCache();
    cache.readError = true;
    const fetcher = vi.fn().mockResolvedValue([]);

    await expect(
      getWalletData({ ...base, cache, now: () => 100, fetcher })
    ).resolves.toEqual([]);
    expect(cache.record?.data).toEqual([]);
    expect(cache.writes).toBe(1);
  });

  it("coalesces concurrent provider requests", async () => {
    const cache = new MemoryCache();
    let resolve!: (value: string[]) => void;
    const fetcher = vi.fn(
      () =>
        new Promise<string[]>((done) => {
          resolve = done;
        })
    );

    const first = getWalletData({ ...base, cache, fetcher });
    const second = getWalletData({ ...base, cache, fetcher });
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    resolve(["result"]);

    await expect(Promise.all([first, second])).resolves.toEqual([
      ["result"],
      ["result"]
    ]);
  });

  it("stores Vault updating results with the short policy", async () => {
    const cache = new MemoryCache();
    const data = { uiStatus: "updating" as const };
    await getWalletData({
      resource: "vault-manage",
      network: "mainnet",
      wallet: "wallet",
      cache,
      now: () => 1_000,
      fetcher: async () => data,
      policy: (value) =>
        value.uiStatus === "updating"
          ? WALLET_CACHE_POLICIES.vaultUpdating
          : WALLET_CACHE_POLICIES.vault
    });

    expect(cache.record).toMatchObject({
      freshUntil: 11_000,
      staleUntil: 61_000,
      data
    });
  });

  describe("scoped resources and mutation markers", () => {
    const jpool = {
      resource: "jpool-manage" as const,
      network: "mainnet",
      wallet: "wallet"
    };
    const recentAware = (
      _data: unknown,
      { recentlyMutated }: { recentlyMutated: boolean }
    ) =>
      recentlyMutated
        ? WALLET_CACHE_POLICIES.jpoolRecent
        : WALLET_CACHE_POLICIES.jpool;

    it("isolates records and in-flight requests per scope", async () => {
      const cache = new MemoryCache();
      const fetcher = vi.fn(async () => "value");
      const [a, b] = await Promise.all([
        getWalletData({
          ...jpool,
          scope: "voteA",
          cache,
          policy: WALLET_CACHE_POLICIES.jpool,
          fetcher: async () => "A"
        }),
        getWalletData({
          ...jpool,
          scope: "voteB",
          cache,
          policy: WALLET_CACHE_POLICIES.jpool,
          fetcher: async () => "B"
        })
      ]);
      expect([a, b]).toEqual(["A", "B"]);
      expect(cache.scoped.get("voteA")?.data).toBe("A");
      expect(cache.scoped.get("voteB")?.data).toBe("B");
      expect(cache.record).toBeNull();

      await expect(
        getWalletData({
          ...jpool,
          scope: "voteA",
          cache,
          policy: WALLET_CACHE_POLICIES.jpool,
          fetcher
        })
      ).resolves.toBe("A");
      expect(fetcher).not.toHaveBeenCalled();
    });

    it("invalidates jpool-manage with a wallet marker instead of a delete", async () => {
      const cache = new MemoryCache();
      await expect(
        invalidateWalletData("jpool-manage", "mainnet", "wallet", cache, () => 500)
      ).resolves.toBe(true);
      expect(cache.markers.get("jpool-manage:mainnet:wallet")).toEqual({
        at: 500,
        ttlMs: WALLET_CACHE_POLICIES.jpool.staleMs
      });
      expect(cache.deletes).toEqual([]);

      await invalidateWalletData("vault-manage", "mainnet", "wallet", cache);
      expect(cache.deletes).toEqual(["vault-manage"]);
      expect(cache.markers.size).toBe(1);
    });

    it("treats every scope fetched before the marker as a miss and uses the recent policy", async () => {
      const cache = new MemoryCache();
      for (const scope of ["voteA", "voteB"]) {
        cache.scoped.set(scope, {
          version: 1,
          cachedAt: 110,
          fetchStartedAt: 100,
          freshUntil: 60_000,
          staleUntil: 600_000,
          data: `old-${scope}`
        });
      }
      await invalidateWalletData("jpool-manage", "mainnet", "wallet", cache, () => 105);

      for (const scope of ["voteA", "voteB"]) {
        await expect(
          getWalletData({
            ...jpool,
            scope,
            cache,
            now: () => 1_000,
            policy: recentAware,
            fetcher: async () => `new-${scope}`
          })
        ).resolves.toBe(`new-${scope}`);
        // jpoolRecent: 10 s fresh, 60 s stale.
        expect(cache.scoped.get(scope)).toMatchObject({
          fetchStartedAt: 1_000,
          freshUntil: 11_000,
          staleUntil: 61_000
        });
      }
    });

    it("serves records fetched after the marker and leaves the recent window after 60 s", async () => {
      const cache = new MemoryCache();
      await invalidateWalletData("jpool-manage", "mainnet", "wallet", cache, () => 100);
      cache.scoped.set("voteA", {
        version: 1,
        cachedAt: 200,
        fetchStartedAt: 150,
        freshUntil: 10_000,
        staleUntil: 60_000,
        data: "after"
      });
      const fetcher = vi.fn(async () => "refetched");
      await expect(
        getWalletData({
          ...jpool,
          scope: "voteA",
          cache,
          now: () => 5_000,
          policy: recentAware,
          fetcher
        })
      ).resolves.toBe("after");
      expect(fetcher).not.toHaveBeenCalled();

      await getWalletData({
        ...jpool,
        scope: "voteA",
        cache,
        now: () => 100 + 60_000,
        forceRefresh: true,
        policy: recentAware,
        fetcher
      });
      // jpool policy again: 60 s fresh, 10 min stale.
      expect(cache.scoped.get("voteA")).toMatchObject({
        freshUntil: 120_100,
        staleUntil: 660_100
      });
    });

    it("falls back to cachedAt for records without fetchStartedAt", async () => {
      const cache = new MemoryCache();
      cache.scoped.set("voteA", record("legacy", 60_000, 600_000));
      await invalidateWalletData("jpool-manage", "mainnet", "wallet", cache, () => 1);
      const fetcher = vi.fn(async () => "fresh");
      await expect(
        getWalletData({
          ...jpool,
          scope: "voteA",
          cache,
          now: () => 10,
          policy: recentAware,
          fetcher
        })
      ).resolves.toBe("fresh");
    });

    it("serves the record when the marker read fails", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const cache = new MemoryCache();
      cache.markerError = true;
      cache.scoped.set("voteA", record("cached", 60_000, 600_000));
      await expect(
        getWalletData({
          ...jpool,
          scope: "voteA",
          cache,
          now: () => 10,
          policy: recentAware,
          fetcher: vi.fn()
        })
      ).resolves.toBe("cached");
    });

    it("does not read markers for unscoped resources", async () => {
      const cache = new MemoryCache();
      const readMutation = vi.spyOn(cache, "readMutation");
      await getWalletData({ ...base, cache, fetcher: async () => [] });
      expect(readMutation).not.toHaveBeenCalled();
    });
  });
});
