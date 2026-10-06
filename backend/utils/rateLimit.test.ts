import { describe, expect, it, vi } from "vitest";

import { clientIp, consumeRateLimit } from "./rateLimit";

function client(reply: unknown) {
  return { eval: vi.fn().mockResolvedValue(reply) };
}

describe("consumeRateLimit", () => {
  it("allows attempts up to the limit", async () => {
    const redis = client([10, 42_000]);
    await expect(consumeRateLimit(redis, "k", 10, 60_000)).resolves.toEqual({
      allowed: true,
      retryAfterSeconds: 42
    });
    expect(redis.eval).toHaveBeenCalledWith(expect.stringContaining("INCR"), {
      keys: ["k"],
      arguments: ["60000"]
    });
  });

  it("refuses attempts over the limit with the remaining window", async () => {
    await expect(consumeRateLimit(client([11, 1_200]), "k", 10, 60_000)).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 2
    });
  });

  it("re-applies the expiry when the key has none", async () => {
    const redis = client([3, 60_000]);
    await consumeRateLimit(redis, "k", 10, 60_000);
    const script = redis.eval.mock.calls[0][0] as string;
    expect(script).toMatch(/count == 1 or ttl < 0/);
    expect(script).toContain("PEXPIRE");
  });

  it("propagates Redis failures and odd replies", async () => {
    await expect(
      consumeRateLimit({ eval: vi.fn().mockRejectedValue(new Error("down")) }, "k", 10, 1)
    ).rejects.toThrow("down");
    await expect(consumeRateLimit(client("OK"), "k", 10, 1)).rejects.toThrow(
      "Unexpected rate limit reply"
    );
  });
});

describe("clientIp", () => {
  it("uses a valid X-Real-IP", () => {
    expect(clientIp(new Headers({ "x-real-ip": " 203.0.113.7 " }))).toBe("203.0.113.7");
    expect(clientIp(new Headers({ "x-real-ip": "2001:db8::1" }))).toBe("2001:db8::1");
  });

  it("falls back to unknown", () => {
    expect(clientIp(new Headers())).toBe("unknown");
    expect(clientIp(new Headers({ "x-real-ip": "1.2.3.4, 5.6.7.8" }))).toBe("unknown");
  });
});
