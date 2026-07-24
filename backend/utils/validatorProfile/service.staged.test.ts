import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const providerMocks = vi.hoisted(() => ({
  stakewiz: vi.fn(),
  trillium: vi.fn(),
  jito: vi.fn(),
  solana: vi.fn(),
  validatorsApp: vi.fn()
}));

vi.mock("./providers", () => {
  const configurations = [
    {
      id: "stakewiz",
      timeoutMs: 5_000,
      provider: providerMocks.stakewiz,
      baseline: true
    },
    { id: "trillium", timeoutMs: 8_000, provider: providerMocks.trillium },
    { id: "jito", timeoutMs: 8_000, provider: providerMocks.jito },
    { id: "solana-rpc", timeoutMs: 8_000, provider: providerMocks.solana },
    {
      id: "validators-app",
      timeoutMs: 5_000,
      provider: providerMocks.validatorsApp
    }
  ];
  return {
    validatorProfileProviderConfigs: configurations,
    validatorProfileProviderConfigsByGroup: {
      identity: configurations,
      commission: configurations,
      apy: configurations,
      mev: configurations
    }
  };
});

import type {
  CachedProfileGroup,
  CachedProfileGroups,
  ValidatorProfileCache,
  ValidatorProfileCacheGroup
} from "./cache";
import { getValidatorProfile } from "./service";
import type { ValidatorNetwork, ValidatorProfileProvider } from "./types";

const OBSERVED_AT = "2026-07-23T18:00:00.000Z";

class MemoryCache implements ValidatorProfileCache {
  groups: CachedProfileGroups = {};
  releaseCount = 0;
  private releaseWaiters: Array<() => void> = [];

  async read(_network: ValidatorNetwork, _voteAccount: string) {
    return this.groups;
  }

  async write(
    _network: ValidatorNetwork,
    _voteAccount: string,
    group: ValidatorProfileCacheGroup,
    value: CachedProfileGroup
  ) {
    this.groups[group] = value;
  }

  async acquireLock() {
    return "lock-token";
  }

  async releaseLock() {
    this.releaseCount += 1;
    this.releaseWaiters.splice(0).forEach((resolve) => resolve());
  }

  waitForRelease() {
    if (this.releaseCount > 0) return Promise.resolve();
    return new Promise<void>((resolve) => this.releaseWaiters.push(resolve));
  }
}

function result(source: string, values: Record<string, unknown>) {
  return { source, observedAt: OBSERVED_AT, values };
}

function deferredProviderResult() {
  let resolve!: (value: Awaited<ReturnType<ValidatorProfileProvider>>) => void;
  const promise = new Promise<Awaited<ReturnType<ValidatorProfileProvider>>>(
    (next) => {
      resolve = next;
    }
  );
  return { promise, resolve };
}

describe("staged validator profile aggregation", () => {
  beforeEach(() => {
    Object.values(providerMocks).forEach((provider) => {
      provider.mockReset();
      provider.mockResolvedValue(null);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns the Stakewiz baseline before slow enhancement finishes", async () => {
    const cache = new MemoryCache();
    const solana = deferredProviderResult();
    providerMocks.stakewiz.mockResolvedValue(
      result("stakewiz", {
        name: "DeepStake",
        description: "If you know, you know",
        logoUrl: "https://example.com/logo.png",
        estimatedApyPercent: 5.64,
        commissionPercent: 9,
        mevCommissionPercent: 4,
        mevEnabled: true
      })
    );
    providerMocks.solana.mockReturnValue(solana.promise);
    providerMocks.jito.mockResolvedValue(
      result("jito", { mevCommissionPercent: 2, mevEnabled: true })
    );

    const profile = await getValidatorProfile(
      "mainnet",
      "staged-vote",
      undefined,
      undefined,
      cache
    );

    expect(profile).toMatchObject({
      status: "fresh",
      name: "DeepStake",
      estimatedApyPercent: 5.64,
      commissionPercent: 9,
      mevCommissionPercent: 4
    });
    expect(cache.releaseCount).toBe(0);

    solana.resolve(result("solana-rpc", { commissionPercent: 3 }));
    await cache.waitForRelease();

    const enhanced = await getValidatorProfile(
      "mainnet",
      "staged-vote",
      undefined,
      undefined,
      cache
    );
    expect(enhanced.commissionPercent).toBe(3);
    expect(enhanced.fields.commissionPercent.source).toBe("solana-rpc");
    expect(enhanced.mevCommissionPercent).toBe(2);
    expect(enhanced.fields.mevCommissionPercent.source).toBe("jito");
  });

  it("logs the provider identity and timeout classification", async () => {
    vi.useFakeTimers();
    const warning = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const cache = new MemoryCache();
    providerMocks.jito.mockImplementation(() => new Promise(() => undefined));

    const request = getValidatorProfile(
      "mainnet",
      "timeout-vote",
      undefined,
      undefined,
      cache
    );
    await vi.advanceTimersByTimeAsync(8_000);
    const profile = await request;

    expect(profile.status).toBe("unavailable");
    expect(warning).toHaveBeenCalledWith(
      "Validator profile provider failed",
      expect.objectContaining({
        provider: "jito",
        kind: "timeout",
        timeoutMs: 8_000
      })
    );
  });

  it("does not accept an all-null baseline as usable", async () => {
    const cache = new MemoryCache();
    providerMocks.stakewiz.mockResolvedValue(
      result("stakewiz", { name: null, estimatedApyPercent: null })
    );
    providerMocks.validatorsApp.mockResolvedValue(
      result("validators-app", { name: "Fallback validator" })
    );

    const profile = await getValidatorProfile(
      "mainnet",
      "empty-baseline-vote",
      undefined,
      undefined,
      cache
    );

    expect(profile.name).toBe("Fallback validator");
    expect(profile.fields.name.source).toBe("validators-app");
    expect(cache.releaseCount).toBe(1);
  });

  it("falls back to enhancement providers when the baseline fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const cache = new MemoryCache();
    providerMocks.stakewiz.mockRejectedValue(new Error("stakewiz down"));
    providerMocks.trillium.mockResolvedValue(
      result("trillium", { logoUrl: "https://example.com/trillium.png" })
    );
    providerMocks.solana.mockResolvedValue(
      result("solana-rpc", { commissionPercent: 0 })
    );
    providerMocks.jito.mockResolvedValue(
      result("jito", { mevCommissionPercent: 0, mevEnabled: true })
    );
    providerMocks.validatorsApp.mockResolvedValue(
      result("validators-app", {
        name: "Fallback validator",
        description: "Fallback description"
      })
    );

    const profile = await getValidatorProfile(
      "mainnet",
      "fallback-vote",
      undefined,
      undefined,
      cache
    );

    expect(profile).toMatchObject({
      status: "partial",
      name: "Fallback validator",
      description: "Fallback description",
      logoUrl: "https://example.com/trillium.png",
      commissionPercent: 0,
      mevCommissionPercent: 0,
      mevEnabled: true
    });
    expect(cache.releaseCount).toBe(1);
  });
});
