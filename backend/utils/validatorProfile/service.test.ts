import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./providers", () => ({ validatorProfileProviders: [] }));

import { getValidatorProfile } from "./service";
import type { ValidatorProfileProvider } from "./types";

function provider(
  source: string,
  values: Record<string, unknown>,
  observedAt = "2026-07-14T10:00:00.000Z"
): ValidatorProfileProvider {
  return vi.fn().mockResolvedValue({ source, values, observedAt });
}

describe("validator profile aggregation", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("merges fields using source-specific precedence", async () => {
    const profile = await getValidatorProfile("mainnet", "vote", [
      provider("stakewiz", {
        name: "Stakewiz name",
        description: "Description",
        logoUrl: "https://stakewiz.example/logo.png",
        estimatedApyPercent: 7.2,
        commissionPercent: 9,
        mevEnabled: true,
        mevCommissionPercent: 8,
      }),
      provider("trillium", { logoUrl: "https://trillium.example/logo.png" }),
      provider("solana-rpc", { commissionPercent: 3 }),
      provider("jito", { mevEnabled: true, mevCommissionPercent: 2.5 }),
    ]);

    expect(profile).toMatchObject({
      status: "fresh",
      name: "Stakewiz name",
      logoUrl: null,
      estimatedApyPercent: 7.2,
      commissionPercent: 3,
      mevEnabled: true,
      mevCommissionPercent: 2.5,
    });
    expect(profile.fields.commissionPercent.source).toBe("solana-rpc");
    expect(profile.fields.mevCommissionPercent.source).toBe("jito");
    expect(profile.fields.logoUrl.source).toBeNull();
  });

  it("returns a partial profile and preserves zero values", async () => {
    const failingProvider: ValidatorProfileProvider = vi
      .fn()
      .mockRejectedValue(new Error("provider down"));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const profile = await getValidatorProfile("devnet", "vote", [
      failingProvider,
      provider("stakewiz", {
        name: "Validator",
        estimatedApyPercent: 0,
        commissionPercent: 0,
      }),
    ]);

    expect(profile.status).toBe("partial");
    expect(profile.estimatedApyPercent).toBe(0);
    expect(profile.commissionPercent).toBe(0);
    expect(profile.mevEnabled).toBeNull();
    expect(profile.fields.mevEnabled).toEqual({
      source: null,
      observedAt: null,
      stale: false,
    });
  });

  it("returns unavailable when every provider fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const profile = await getValidatorProfile("mainnet", "vote", [
      vi.fn().mockRejectedValue(new Error("down")),
    ]);

    expect(profile.status).toBe("unavailable");
    expect(profile.name).toBeNull();
    expect(profile.commissionPercent).toBeNull();
  });

  it("returns completed provider data when another provider exceeds the deadline", async () => {
    vi.useFakeTimers();
    let receivedSignal: AbortSignal | undefined;
    const hanging: ValidatorProfileProvider = vi.fn(({ signal }) => {
      receivedSignal = signal;
      return new Promise<never>(() => undefined);
    });
    const request = getValidatorProfile(
      "mainnet",
      "vote",
      [provider("stakewiz", { name: "Available" }), hanging],
      50
    );

    await vi.advanceTimersByTimeAsync(50);
    const profile = await request;

    expect(profile.name).toBe("Available");
    expect(profile.status).toBe("partial");
    expect(receivedSignal?.aborted).toBe(true);
  });
});
