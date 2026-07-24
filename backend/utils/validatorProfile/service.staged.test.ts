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
    validatorProfileProviderConfigsByGroup: {
      identity: [configurations[0], configurations[4]],
      logo: [configurations[1], configurations[0], configurations[4]],
      commission: [configurations[3], configurations[0], configurations[4]],
      apy: [configurations[0]],
      mev: [configurations[2], configurations[0]]
    }
  };
});

import type {
  CachedProfileGroup,
  CachedProfileGroups,
  ValidatorProfileCache,
  ValidatorProfileCacheGroup
} from "./cache";
import { getValidatorLogo, getValidatorProfile } from "./service";
import type { ValidatorNetwork, ValidatorProfileProvider } from "./types";

const OBSERVED_AT = "2026-07-23T18:00:00.000Z";

class MemoryCache implements ValidatorProfileCache {
  groups: CachedProfileGroups = {};
  lockScopes: Array<"profile" | "logo"> = [];
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

  async acquireLock(
    _network: ValidatorNetwork,
    _voteAccount: string,
    scope: "profile" | "logo"
  ) {
    this.lockScopes.push(scope);
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

  it("returns the Stakewiz baseline without waiting for logo providers", async () => {
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
    providerMocks.trillium.mockResolvedValue(
      result("trillium", {
        logoUrl: "https://example.com/trillium.png"
      })
    );
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
      logoUrl: null,
      estimatedApyPercent: 5.64,
      commissionPercent: 9,
      mevCommissionPercent: 4
    });
    expect(profile.fields.logoUrl.source).toBeNull();
    expect(providerMocks.trillium).not.toHaveBeenCalled();
    expect(cache.lockScopes).toEqual(["profile"]);
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

  it("keeps only the logo response pending until Trillium completes", async () => {
    const cache = new MemoryCache();
    const trillium = deferredProviderResult();
    providerMocks.stakewiz.mockResolvedValue(
      result("stakewiz", {
        name: "DeepStake",
        logoUrl: "https://example.com/stakewiz.png"
      })
    );
    providerMocks.trillium.mockReturnValue(trillium.promise);

    let settled = false;
    const request = getValidatorLogo(
      "mainnet",
      "strict-logo-vote",
      undefined,
      undefined,
      cache
    ).finally(() => {
      settled = true;
    });

    await vi.waitFor(() => expect(providerMocks.trillium).toHaveBeenCalled());
    expect(settled).toBe(false);

    trillium.resolve(
      result("trillium", { logoUrl: "https://example.com/trillium.png" })
    );
    const profile = await request;

    expect(profile.logoUrl).toBe("https://example.com/trillium.png");
    expect(profile.field.source).toBe("trillium");
    expect(cache.lockScopes).toEqual(["logo"]);
  });

  it("falls back to the Stakewiz logo only after Trillium times out", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const cache = new MemoryCache();
    providerMocks.stakewiz.mockResolvedValue(
      result("stakewiz", {
        name: "DeepStake",
        logoUrl: "https://example.com/stakewiz.png"
      })
    );
    providerMocks.trillium.mockImplementation(
      () => new Promise(() => undefined)
    );

    let settled = false;
    const request = getValidatorLogo(
      "mainnet",
      "fallback-logo-vote",
      undefined,
      undefined,
      cache
    ).finally(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(7_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    const profile = await request;
    expect(profile.logoUrl).toBe("https://example.com/stakewiz.png");
    expect(profile.field.source).toBe("stakewiz");
  });

  it("uses Validators.app when Trillium and Stakewiz have no logo", async () => {
    const cache = new MemoryCache();
    providerMocks.stakewiz.mockResolvedValue(
      result("stakewiz", { name: "DeepStake" })
    );
    providerMocks.validatorsApp.mockResolvedValue(
      result("validators-app", {
        logoUrl: "https://example.com/validators-app.png"
      })
    );

    const profile = await getValidatorLogo(
      "mainnet",
      "last-logo-fallback-vote",
      undefined,
      undefined,
      cache
    );

    expect(profile.logoUrl).toBe("https://example.com/validators-app.png");
    expect(profile.field.source).toBe("validators-app");
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
    const events = warning.mock.calls.map(([message]) =>
      JSON.parse(message as string)
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        event: "validator_profile_provider_failed",
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
      logoUrl: null,
      commissionPercent: 0,
      mevCommissionPercent: 0,
      mevEnabled: true
    });
    expect(cache.releaseCount).toBe(1);
  });
});
