import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  cachedRequest,
  clearRequestCache,
  invalidateRequestCacheByPrefix,
} from "./requestCache";

describe("request cache", () => {
  beforeEach(() => {
    clearRequestCache();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });

  afterEach(() => {
    clearRequestCache();
    vi.useRealTimers();
  });

  it("returns cached data within the TTL", async () => {
    const fetcher = vi.fn().mockResolvedValue({ value: 1 });

    const first = await cachedRequest("key", 1000, fetcher);
    const second = await cachedRequest("key", 1000, fetcher);

    expect(second).toBe(first);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("expires cached data after the TTL", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ value: 1 })
      .mockResolvedValueOnce({ value: 2 });

    await expect(cachedRequest("key", 1000, fetcher)).resolves.toEqual({ value: 1 });
    vi.advanceTimersByTime(1001);
    await expect(cachedRequest("key", 1000, fetcher)).resolves.toEqual({ value: 2 });

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("deduplicates concurrent identical requests", async () => {
    const fetcher = vi.fn().mockResolvedValue({ value: 1 });

    const [first, second] = await Promise.all([
      cachedRequest("key", 1000, fetcher),
      cachedRequest("key", 1000, fetcher),
    ]);

    expect(second).toBe(first);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("invalidates matching prefixes", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ value: 1 })
      .mockResolvedValueOnce({ value: 2 });

    await cachedRequest("wallet:one", 1000, fetcher);
    invalidateRequestCacheByPrefix("wallet:");
    await expect(cachedRequest("wallet:one", 1000, fetcher)).resolves.toEqual({ value: 2 });
  });

  it("does not cache failed requests", async () => {
    const fetcher = vi.fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ value: 2 });

    await expect(cachedRequest("key", 1000, fetcher)).rejects.toThrow("boom");
    await expect(cachedRequest("key", 1000, fetcher)).resolves.toEqual({ value: 2 });

    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
