import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  WalletCacheRecord,
  WalletDataCache,
  WalletDataResource
} from "./cache";
import { getWalletData, WALLET_CACHE_POLICIES } from "./service";

class MemoryCache implements WalletDataCache {
  record: WalletCacheRecord | null = null;
  readError = false;
  writes = 0;
  async read<T>(): Promise<WalletCacheRecord<T> | null> {
    if (this.readError) throw new Error("redis down");
    return this.record as WalletCacheRecord<T> | null;
  }
  async write<T>(
    _resource: WalletDataResource,
    _network: string,
    _wallet: string,
    record: WalletCacheRecord<T>
  ) {
    this.record = record;
    this.writes += 1;
  }
  async delete() {
    this.record = null;
  }
  async acquireLock() {
    return "token";
  }
  async releaseLock() {}
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
});
