import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { runMock, evalMock, redisState } = vi.hoisted(() => ({
  runMock: vi.fn(),
  evalMock: vi.fn(),
  redisState: { configured: true, down: false }
}));

vi.mock("@/utils/selftest", () => ({ runNativeSelftest: runMock }));
vi.mock("@/utils/redis", () => ({
  isRedisConfigured: () => redisState.configured,
  getRedisClient: async () => {
    if (redisState.down) throw new Error("Redis connection is in cooldown");
    return { eval: evalMock };
  }
}));

import { POST } from "./route";

const OK_RESULT = {
  ok: true,
  network: "mainnet",
  minimumSol: 1.00228288,
  unitsConsumed: 12_345,
  elapsedMs: 900
};

function request(token?: string) {
  const headers = new Headers({ "x-real-ip": "203.0.113.7" });
  if (token !== undefined) headers.set("authorization", `Bearer ${token}`);
  return new Request("http://localhost/api/selftest", {
    method: "POST",
    headers
  }) as unknown as NextRequest;
}

describe("POST /api/selftest", () => {
  beforeEach(() => {
    vi.stubEnv("SELFTEST_TOKEN", "token");
    redisState.configured = true;
    redisState.down = false;
    evalMock.mockReset().mockResolvedValue([1, 60_000]);
    runMock.mockReset().mockResolvedValue(OK_RESULT);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("returns 503 when SELFTEST_TOKEN is not configured", async () => {
    vi.stubEnv("SELFTEST_TOKEN", " ");

    const response = await POST(request("token"));

    expect(response.status).toBe(503);
    expect(runMock).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", undefined],
    ["wrong", "nope"]
  ])("returns 401 for a %s token", async (_label, token) => {
    const response = await POST(request(token));

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe("Bearer");
    expect(runMock).not.toHaveBeenCalled();
  });

  it("returns 200 with the result", async () => {
    const response = await POST(request("token"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual(OK_RESULT);
  });

  it("returns 503 and logs the stage on failure", async () => {
    const failure = {
      ok: false,
      network: "mainnet",
      stage: "generate",
      error: "MAINNET_RPC_ENDPOINT environment variable not set",
      elapsedMs: 5
    };
    runMock.mockResolvedValue(failure);

    const response = await POST(request("token"));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual(failure);
    expect(console.error).toHaveBeenCalledWith(
      "Selftest failed at generate after 5 ms: MAINNET_RPC_ENDPOINT environment variable not set"
    );
  });

  it("counts attempts per IP before checking the token", async () => {
    evalMock.mockResolvedValue([11, 42_000]);

    const response = await POST(request("nope"));

    expect(evalMock).toHaveBeenCalledWith(expect.any(String), {
      keys: ["rate-limit:v1:selftest:ip:203.0.113.7"],
      arguments: ["60000"]
    });
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("42");
    expect(runMock).not.toHaveBeenCalled();
  });

  it.each([
    ["unavailable", { configured: true, down: true }],
    ["not configured", { configured: false, down: false }]
  ])("still runs when Redis is %s", async (_label, state) => {
    Object.assign(redisState, state);

    const response = await POST(request("token"));

    expect(response.status).toBe(200);
  });
});
