import { beforeEach, describe, expect, it, vi } from "vitest";

import packageJson from "@/package.json";

const { rpcState, sendMock, pingMock, redisState } = vi.hoisted(() => ({
  rpcState: { endpoint: "https://rpc.example/?api-key=SECRET" },
  sendMock: vi.fn(),
  pingMock: vi.fn(),
  redisState: { configured: true }
}));

vi.mock("@/utils/solana/rpc", () => ({
  getRpcEndpoint: () => rpcState.endpoint,
  createRpcConnection: () => ({
    getLatestBlockhash: () => ({ send: sendMock })
  })
}));

vi.mock("@/utils/redis", () => ({
  isRedisConfigured: () => redisState.configured,
  getRedisClient: async () => ({ ping: pingMock })
}));

import { HEALTH_CACHE_TTL_MS, resetHealthCacheForTests } from "@/utils/health";
import { GET } from "./route";

async function check() {
  const response = await GET();
  return { status: response.status, response, body: await response.json() };
}

describe("GET /api/health", () => {
  beforeEach(() => {
    resetHealthCacheForTests();
    rpcState.endpoint = "https://rpc.example/?api-key=SECRET";
    redisState.configured = true;
    sendMock.mockReset().mockResolvedValue({ value: { blockhash: "x" } });
    pingMock.mockReset().mockResolvedValue("PONG");
    vi.stubEnv("MAINNET_RPC_ENDPOINT", rpcState.endpoint);
    vi.stubEnv("DEVNET_RPC_ENDPOINT", "https://devnet.example");
    vi.stubEnv("METRICS_BEARER_TOKEN", "m");
    vi.stubEnv("TELEMETRY_STATS_TOKEN", "t");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("returns ok with every dependency checked", async () => {
    const { status, response, body } = await check();

    expect(status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toMatchObject({
      status: "ok",
      service: "deepstake-backend",
      checks: {
        rpc_mainnet: { ok: true, latencyMs: expect.any(Number) },
        redis: { ok: true },
        config: {
          rpc_mainnet: true,
          rpc_devnet: true,
          metrics_token: true,
          telemetry_token: true
        }
      },
      version: packageJson.version
    });
  });

  it("returns 503 without calling the RPC when the mainnet endpoint is unset", async () => {
    rpcState.endpoint = "";
    vi.stubEnv("MAINNET_RPC_ENDPOINT", "");

    const { status, body } = await check();

    expect(status).toBe(503);
    expect(body.status).toBe("degraded");
    expect(body.checks.rpc_mainnet).toEqual({ ok: false });
    expect(body.checks.config.rpc_mainnet).toBe(false);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("returns 503 when the RPC call fails, without leaking the endpoint", async () => {
    sendMock.mockRejectedValue(
      new Error("fetch failed: https://rpc.example/?api-key=SECRET")
    );

    const { status, body } = await check();

    expect(status).toBe(503);
    expect(body.checks.rpc_mainnet).toEqual({ ok: false });
    expect(JSON.stringify(body)).not.toContain("SECRET");
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain(
      "SECRET"
    );
  });

  it("returns 503 when the RPC does not answer in 3 seconds", async () => {
    vi.useFakeTimers();
    try {
      sendMock.mockReturnValue(new Promise(() => undefined));
      const pending = GET();
      await vi.advanceTimersByTimeAsync(3_000);
      const response = await pending;

      expect(response.status).toBe(503);
      expect((await response.json()).checks.rpc_mainnet).toEqual({ ok: false });
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    ["down", () => pingMock.mockRejectedValue(new Error("ECONNREFUSED"))],
    ["not configured", () => (redisState.configured = false)]
  ])("reports degraded with 200 when Redis is %s", async (_label, setup) => {
    setup();

    const { status, body } = await check();

    expect(status).toBe(200);
    expect(body.status).toBe("degraded");
    expect(body.checks.redis).toEqual({ ok: false });
    expect(body.checks.rpc_mainnet.ok).toBe(true);
  });

  it("reports missing tokens and devnet RPC without degrading", async () => {
    vi.stubEnv("DEVNET_RPC_ENDPOINT", "");
    vi.stubEnv("METRICS_BEARER_TOKEN", " ");
    vi.stubEnv("TELEMETRY_STATS_TOKEN", "");

    const { status, body } = await check();

    expect(status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.checks.config).toEqual({
      rpc_mainnet: true,
      rpc_devnet: false,
      metrics_token: false,
      telemetry_token: false
    });
  });

  it("caches the report for 30 seconds", async () => {
    vi.useFakeTimers();
    try {
      await GET();
      await GET();
      expect(sendMock).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(HEALTH_CACHE_TTL_MS);
      await GET();
      expect(sendMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
