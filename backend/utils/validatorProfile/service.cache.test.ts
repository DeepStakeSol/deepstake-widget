import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./providers", () => ({
  validatorProfileProviders: [],
  validatorProfileProvidersByGroup: {
    identity: [],
    commission: [],
    apy: [],
    mev: []
  }
}));

import {
  CACHE_POLICIES,
  type CachedProfileGroup,
  type CachedProfileGroups,
  type ValidatorProfileCache,
  type ValidatorProfileCacheGroup
} from "./cache";
import { getValidatorProfile } from "./service";
import type {
  ValidatorNetwork,
  ValidatorProfileField,
  ValidatorProfileProvider
} from "./types";

const NOW = Date.parse("2026-07-23T12:00:00.000Z");
const OBSERVED_AT = "2026-07-23T11:59:00.000Z";

class MemoryCache implements ValidatorProfileCache {
  groups: CachedProfileGroups;
  writes: ValidatorProfileCacheGroup[] = [];
  readError: Error | null = null;
  lockToken: string | null = "lock-token";
  readCount = 0;
  populateOnSecondRead = false;
  private writeWaiters: Array<() => void> = [];

  constructor(groups: CachedProfileGroups = {}) {
    this.groups = groups;
  }

  async read(_network: ValidatorNetwork, _voteAccount: string) {
    if (this.readError) throw this.readError;
    this.readCount += 1;
    if (this.populateOnSecondRead && this.readCount === 2) {
      this.groups = allGroupsFresh();
    }
    return this.groups;
  }

  async write(
    _network: ValidatorNetwork,
    _voteAccount: string,
    cacheGroup: ValidatorProfileCacheGroup,
    value: CachedProfileGroup
  ) {
    this.groups[cacheGroup] = value;
    this.writes.push(cacheGroup);
    this.writeWaiters.splice(0).forEach((resolve) => resolve());
  }

  async acquireLock() {
    return this.lockToken;
  }

  async releaseLock() {}

  waitForWrite() {
    if (this.writes.length > 0) return Promise.resolve();
    return new Promise<void>((resolve) => this.writeWaiters.push(resolve));
  }
}

function group(
  refreshedAt: number,
  values: Partial<Record<ValidatorProfileField, unknown>> = {},
  cachedAt = refreshedAt
): CachedProfileGroup {
  return {
    version: 1,
    refreshedAt,
    records: Object.fromEntries(
      Object.entries(values).map(([field, value]) => [
        field,
        { value, source: "cache-source", observedAt: OBSERVED_AT, cachedAt }
      ])
    )
  };
}

function allGroupsFresh(): CachedProfileGroups {
  return {
    identity: group(NOW, { name: "Cached validator" }),
    commission: group(NOW, { commissionPercent: 4 }),
    apy: group(NOW, { estimatedApyPercent: 7 }),
    mev: group(NOW, { mevEnabled: false })
  };
}

function deferredProvider() {
  let resolve!: (value: Awaited<ReturnType<ValidatorProfileProvider>>) => void;
  const provider = vi.fn<ValidatorProfileProvider>(
    () => new Promise((next) => (resolve = next))
  );
  return {
    provider,
    resolve: (values: Record<string, unknown>) =>
      resolve({ source: "stakewiz", observedAt: OBSERVED_AT, values })
  };
}

describe("validator profile cache resilience", () => {
  afterEach(() => vi.restoreAllMocks());

  it("serves a fully fresh cache without calling providers", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    const cache = new MemoryCache(allGroupsFresh());
    const provider = vi.fn<ValidatorProfileProvider>();

    const profile = await getValidatorProfile(
      "mainnet",
      "fresh-vote",
      [provider],
      100,
      cache
    );

    expect(profile.status).toBe("fresh");
    expect(profile.name).toBe("Cached validator");
    expect(provider).not.toHaveBeenCalled();
  });

  it("returns stale data immediately and preserves last-known-good fields", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    const staleAt = NOW - CACHE_POLICIES.identity.freshMs - 1;
    const cache = new MemoryCache({
      identity: group(
        staleAt,
        { name: "Old name", logoUrl: "https://example.com/old.png" },
        staleAt
      )
    });
    const { provider, resolve } = deferredProvider();

    const first = await getValidatorProfile(
      "mainnet",
      "stale-vote",
      [provider],
      100,
      cache
    );

    expect(first.status).toBe("stale");
    expect(first.name).toBe("Old name");
    expect(first.fields.logoUrl.stale).toBe(true);

    resolve({ name: "New name", logoUrl: null });
    await cache.waitForWrite();

    const second = await getValidatorProfile(
      "mainnet",
      "stale-vote",
      [provider],
      100,
      cache
    );
    expect(second.name).toBe("New name");
    expect(second.logoUrl).toBe("https://example.com/old.png");
    expect(second.fields.logoUrl.stale).toBe(true);
  });

  it("coalesces concurrent cold-cache requests", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    const cache = new MemoryCache();
    const { provider, resolve } = deferredProvider();

    const first = getValidatorProfile(
      "mainnet",
      "cold-vote",
      [provider],
      100,
      cache
    );
    const second = getValidatorProfile(
      "mainnet",
      "cold-vote",
      [provider],
      100,
      cache
    );
    await vi.waitFor(() => expect(provider).toHaveBeenCalledTimes(1));

    resolve({ name: "Coalesced" });
    const profiles = await Promise.all([first, second]);

    expect(profiles[0].name).toBe("Coalesced");
    expect(profiles[1].name).toBe("Coalesced");
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it("uses a peer refresh when another instance owns the Redis lock", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    const cache = new MemoryCache();
    cache.lockToken = null;
    cache.populateOnSecondRead = true;
    const provider = vi.fn<ValidatorProfileProvider>();

    const profile = await getValidatorProfile(
      "mainnet",
      "peer-vote",
      [provider],
      200,
      cache
    );

    expect(profile.name).toBe("Cached validator");
    expect(provider).not.toHaveBeenCalled();
    expect(cache.readCount).toBe(2);
  });

  it("bypasses a failed cache while retaining local coalescing", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const cache = new MemoryCache();
    cache.readError = new Error("redis down");
    const { provider, resolve } = deferredProvider();

    const first = getValidatorProfile(
      "mainnet",
      "redis-down-vote",
      [provider],
      100,
      cache
    );
    const second = getValidatorProfile(
      "mainnet",
      "redis-down-vote",
      [provider],
      100,
      cache
    );
    await vi.waitFor(() => expect(provider).toHaveBeenCalledTimes(1));

    resolve({ name: "Direct fallback" });
    const profiles = await Promise.all([first, second]);

    expect(profiles[0].name).toBe("Direct fallback");
    expect(profiles[1].name).toBe("Direct fallback");
  });
});
