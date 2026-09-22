import { describe, expect, it, vi } from "vitest";

const redis = vi.hoisted(() => ({
  mGet: vi.fn().mockResolvedValue([null, null, null, null, null]),
  set: vi.fn().mockResolvedValue("OK"),
  eval: vi.fn().mockResolvedValue(1)
}));

vi.mock("../redis", () => ({
  getRedisClient: async () => redis,
  isRedisConfigured: () => true
}));

import { getValidatorProfileCache } from "./cache";

describe("validator profile Redis namespace", () => {
  it("uses v3 for every group and both distributed lock scopes", async () => {
    const cache = getValidatorProfileCache()!;
    await cache.read("mainnet", "vote");
    expect(redis.mGet).toHaveBeenCalledWith([
      "validator-profile:v3:mainnet:vote:identity",
      "validator-profile:v3:mainnet:vote:logo",
      "validator-profile:v3:mainnet:vote:commission",
      "validator-profile:v3:mainnet:vote:apy",
      "validator-profile:v3:mainnet:vote:mev"
    ]);

    await cache.write("mainnet", "vote", "logo", {
      version: 1,
      refreshedAt: 1,
      records: {}
    });
    expect(redis.set).toHaveBeenCalledWith(
      "validator-profile:v3:mainnet:vote:logo",
      expect.any(String),
      expect.objectContaining({ PX: expect.any(Number) })
    );

    for (const scope of ["profile", "logo"] as const) {
      const token = await cache.acquireLock("mainnet", "vote", scope, 12_000);
      expect(token).toBeTruthy();
      expect(redis.set).toHaveBeenCalledWith(
        `validator-profile:v3:lock:${scope}:mainnet:vote`,
        token,
        { NX: true, PX: 12_000 }
      );
      await cache.releaseLock("mainnet", "vote", scope, token!);
      expect(redis.eval).toHaveBeenCalledWith(
        expect.any(String),
        { keys: [`validator-profile:v3:lock:${scope}:mainnet:vote`], arguments: [token] }
      );
    }
  });
});
