import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { runMock, evalMock, redisState } = vi.hoisted(() => ({
  runMock: vi.fn(),
  evalMock: vi.fn(),
  redisState: { configured: true, down: false }
}));

vi.mock("@/utils/selftest", () => ({
  runSelftest: runMock,
  SELFTEST_CHECKS: ["native", "jpool"]
}));
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
  elapsedMs: 900,
  checks: {
    native: {
      ok: true,
      minimumSol: 1.00228288,
      unitsConsumed: 12_345,
      elapsedMs: 900
    },
    jpool: { ok: true, skipped: "JPOOL_POOL_UPDATING", elapsedMs: 300 }
  }
};

function request(token?: string, query = "") {
  const headers = new Headers({ "x-real-ip": "203.0.113.7" });
  if (token !== undefined) headers.set("authorization", `Bearer ${token}`);
  return new NextRequest(`http://localhost/api/selftest${query}`, {
    method: "POST",
    headers
  });
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

  it("runs every check and returns 200 with the result", async () => {
    const response = await POST(request("token"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual(OK_RESULT);
    expect(runMock).toHaveBeenCalledWith(["native", "jpool"]);
  });

  it("runs only the check named in the query", async () => {
    await POST(request("token", "?check=jpool"));

    expect(runMock).toHaveBeenCalledWith(["jpool"]);
  });

  it("rejects an unknown check", async () => {
    const response = await POST(request("token", "?check=blaze"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "check must be one of: native, jpool"
    });
    expect(runMock).not.toHaveBeenCalled();
  });

  it("returns 503 and logs each failed check", async () => {
    const failure = {
      ok: false,
      network: "mainnet",
      elapsedMs: 5,
      checks: {
        native: {
          ok: false,
          stage: "generate",
          error: "MAINNET_RPC_ENDPOINT environment variable not set",
          elapsedMs: 5
        },
        jpool: { ok: true, unitsConsumed: 40_000, elapsedMs: 4 }
      }
    };
    runMock.mockResolvedValue(failure);

    const response = await POST(request("token"));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual(failure);
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith(
      "Selftest native failed at generate after 5 ms: MAINNET_RPC_ENDPOINT environment variable not set"
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
