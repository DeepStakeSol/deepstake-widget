import { beforeEach, describe, expect, it, vi } from "vitest";

import jpoolStakePoolFixture from "@/test/fixtures/jpool-stake-pool.json";

const { accountSendMock, rentSendMock, redis, redisConfigured } = vi.hoisted(() => ({
  accountSendMock: vi.fn(),
  rentSendMock: vi.fn(),
  redis: { get: vi.fn(), set: vi.fn() },
  redisConfigured: { value: false }
}));

vi.mock("@/utils/solana/rpc", () => ({
  getRpcEndpoint: vi.fn(() => "https://rpc.example"),
  createRpcConnection: vi.fn(() => ({
    getAccountInfo: vi.fn(() => ({ send: accountSendMock })),
    getMinimumBalanceForRentExemption: vi.fn(() => ({ send: rentSendMock }))
  }))
}));

vi.mock("@/utils/redis", () => ({
  isRedisConfigured: () => redisConfigured.value,
  getRedisClient: () => Promise.resolve(redis)
}));

import { GET } from "./route";

const POOL = "CtMyWsrUtAwXWiGr9WjHT5fC3p3fgV8cyGpLTo2LJzG1";

function request(network = "mainnet") {
  return {
    nextUrl: new URL(`http://localhost/api/jpool/pool?network=${network}`)
  } as never;
}

describe("GET /api/jpool/pool", () => {
  beforeEach(() => {
    accountSendMock.mockReset().mockResolvedValue({
      value: {
        owner: "SPoo1Ku8WFXoNDMHPsrGSTSG1Y47rzgn41SLUNakuHy",
        data: [jpoolStakePoolFixture.data, "base64"]
      }
    });
    rentSendMock.mockReset().mockResolvedValue(BigInt(1_488_440));
    redis.get.mockReset().mockResolvedValue(null);
    redis.set.mockReset().mockResolvedValue("OK");
    redisConfigured.value = false;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("returns pool rate and fee as base-unit strings", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      network: "mainnet",
      poolAddress: POOL,
      depositsRestricted: false,
      ataRentLamports: "1488440"
    });
    for (const value of [
      body.totalLamports,
      body.poolTokenSupply,
      body.lastUpdateEpoch,
      body.solDepositFee.denominator,
      body.solDepositFee.numerator
    ]) {
      expect(value).toMatch(/^[0-9]+$/);
    }
  });

  it("serves and populates the Redis cache", async () => {
    redisConfigured.value = true;
    await GET(request());
    expect(redis.set).toHaveBeenCalledWith(
      `jpool:v1:pool:mainnet:${POOL}`,
      expect.any(String),
      { PX: 300_000 }
    );

    redis.get.mockResolvedValue(JSON.stringify({ cached: true }));
    accountSendMock.mockClear();
    expect(await (await GET(request())).json()).toEqual({ cached: true });
    expect(accountSendMock).not.toHaveBeenCalled();
  });

  it("falls back to RPC when Redis fails", async () => {
    redisConfigured.value = true;
    redis.get.mockRejectedValue(new Error("down"));
    redis.set.mockRejectedValue(new Error("down"));
    expect((await GET(request())).status).toBe(200);
  });

  it("is mainnet only", async () => {
    const response = await GET(request("devnet"));
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("JPOOL_MAINNET_ONLY");
  });

  it("rejects an account not owned by the Stake Pool program", async () => {
    accountSendMock.mockResolvedValue({
      value: { owner: "11111111111111111111111111111111", data: ["", "base64"] }
    });
    const response = await GET(request());
    expect(response.status).toBe(500);
    expect((await response.json()).code).toBe("JPOOL_POOL_INVALID");
  });

  it("reports RPC failures as unavailable", async () => {
    accountSendMock.mockRejectedValue(new Error("rpc down"));
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe("JPOOL_RPC_UNAVAILABLE");
  });

  it("still returns the pool when the rent read fails", async () => {
    rentSendMock.mockRejectedValue(new Error("rpc hiccup"));
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect((await response.json()).ataRentLamports).toBeNull();
  });
});
