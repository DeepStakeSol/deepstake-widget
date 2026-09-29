import { beforeEach, describe, expect, it, vi } from "vitest";

const { redis, redisConfigured } = vi.hoisted(() => ({
  redis: { get: vi.fn(), set: vi.fn() },
  redisConfigured: { value: false }
}));

vi.mock("@/utils/redis", () => ({
  isRedisConfigured: () => redisConfigured.value,
  getRedisClient: () => Promise.resolve(redis)
}));

import {
  decideEligibility,
  ELIGIBILITY_FALLBACK_TTL_MS,
  ELIGIBILITY_RESULT_TTL_MS,
  eligibilityFallbackKey,
  eligibilityResultKey,
  EPOCH_CACHE_TTL_MS,
  fetchJpoolScore,
  getCurrentEpoch,
  getJpoolEligibility,
  JPOOL_SCORES_TIMEOUT_MS,
  parseJpoolScore,
  resetEpochCacheForTests,
  type JpoolValidatorScore
} from "./eligibility";
import { JpoolApiError } from "./api";

const VOTE = "DeEpSdaw8uBLQ5T2HQhDf8fBSVbm13jGqJwoSF3HTpL5";
const OTHER_VOTE = "Vote111111111111111111111111111111111111111";
const EPOCH = 1045;

// Trimmed from a live row (epoch 1045); extra fields are ignored.
function row(overrides: Record<string, unknown> = {}) {
  return {
    voteId: VOTE,
    epoch: EPOCH,
    name: "DeepStake",
    isBlocked: false,
    isSuperMinority: false,
    isJpoolValidator: true,
    isValidCommission: true,
    ...overrides
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function score(
  overrides: Partial<JpoolValidatorScore> = {}
): JpoolValidatorScore {
  return {
    epoch: EPOCH,
    isBlocked: false,
    isSuperMinority: false,
    isJpoolValidator: true,
    ...overrides
  };
}

function rpcReturning(send: () => Promise<unknown>) {
  const getEpochInfo = vi.fn(() => ({ send: vi.fn(send) }));
  return { factory: vi.fn(() => ({ getEpochInfo }) as never), getEpochInfo };
}

describe("parseJpoolScore", () => {
  it("reads the flags of the exact vote and epoch row", () => {
    expect(
      parseJpoolScore(
        { data: [row({ voteId: OTHER_VOTE, isBlocked: true }), row()] },
        VOTE,
        EPOCH
      )
    ).toEqual(score());
  });

  it("accepts the epoch as a string", () => {
    expect(
      parseJpoolScore({ data: [row({ epoch: "1045" })] }, VOTE, EPOCH)
    ).toEqual(score());
  });

  it("keeps membership unknown when the field is missing", () => {
    expect(
      parseJpoolScore(
        { data: [row({ isJpoolValidator: undefined })] },
        VOTE,
        EPOCH
      )
    ).toEqual(score({ isJpoolValidator: null }));
  });

  it("reports an empty data array as empty", () => {
    expect(() => parseJpoolScore({ data: [] }, VOTE, EPOCH)).toThrow(
      expect.objectContaining({ kind: "empty" })
    );
  });

  it.each([
    ["null", null],
    ["array body", []],
    ["missing data", {}],
    ["another vote only", { data: [row({ voteId: OTHER_VOTE })] }],
    ["another epoch only", { data: [row({ epoch: EPOCH - 1 })] }],
    ["non-object row", { data: ["x"] }],
    ["missing isBlocked", { data: [row({ isBlocked: undefined })] }],
    ["string isSuperMinority", { data: [row({ isSuperMinority: "false" })] }]
  ])("rejects %s as malformed", (_label, body) => {
    expect(() => parseJpoolScore(body, VOTE, EPOCH)).toThrow(
      expect.objectContaining({ kind: "malformed" })
    );
  });
});

describe("fetchJpoolScore", () => {
  it("calls the scores endpoint for the epoch and vote", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ data: [row()] }));
    await expect(fetchJpoolScore(EPOCH, VOTE, fetchImpl)).resolves.toEqual(
      score()
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      `https://api.validators.svt.one/jpool-scores/${EPOCH}/${VOTE}`,
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it("times out after 1.5 s", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () =>
              reject(new Error("aborted"))
            );
          })
      );
      const pending = fetchJpoolScore(EPOCH, VOTE, fetchImpl as typeof fetch);
      const assertion = expect(pending).rejects.toMatchObject({
        kind: "timeout"
      });
      await vi.advanceTimersByTimeAsync(JPOOL_SCORES_TIMEOUT_MS);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it("maps HTTP errors", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, 502));
    await expect(
      fetchJpoolScore(EPOCH, VOTE, fetchImpl)
    ).rejects.toBeInstanceOf(JpoolApiError);
  });
});

describe("decideEligibility", () => {
  it("is eligible without blockers", () => {
    expect(decideEligibility(score(), false)).toEqual({
      eligible: true,
      reason: null,
      epoch: EPOCH,
      source: "jpool"
    });
  });

  it("blocks on isBlocked before isSuperMinority", () => {
    expect(
      decideEligibility(
        score({ isBlocked: true, isSuperMinority: true }),
        false
      )
    ).toMatchObject({ eligible: false, reason: "blocked" });
  });

  it("blocks on isSuperMinority", () => {
    expect(
      decideEligibility(score({ isSuperMinority: true }), false)
    ).toMatchObject({
      eligible: false,
      reason: "superminority"
    });
  });

  it("ignores membership by default", () => {
    expect(
      decideEligibility(score({ isJpoolValidator: false }), false)
    ).toMatchObject({ eligible: true, reason: null });
  });

  it("requires membership when the flag is on", () => {
    expect(
      decideEligibility(score({ isJpoolValidator: false }), true)
    ).toMatchObject({
      eligible: false,
      reason: "not_member"
    });
    expect(
      decideEligibility(score({ isJpoolValidator: null }), true)
    ).toMatchObject({
      eligible: true,
      reason: null
    });
  });
});

describe("getCurrentEpoch", () => {
  beforeEach(() => {
    resetEpochCacheForTests();
    vi.stubEnv("MAINNET_RPC_ENDPOINT", "https://rpc.example");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("caches the epoch in-process for 60 s", async () => {
    vi.useFakeTimers();
    try {
      const rpc = rpcReturning(async () => ({ epoch: BigInt(EPOCH) }));
      expect(await getCurrentEpoch("mainnet", rpc.factory)).toBe(EPOCH);
      expect(await getCurrentEpoch("mainnet", rpc.factory)).toBe(EPOCH);
      expect(rpc.getEpochInfo).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(EPOCH_CACHE_TTL_MS + 1);
      await getCurrentEpoch("mainnet", rpc.factory);
      expect(rpc.getEpochInfo).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns null and does not cache when RPC fails", async () => {
    const rpc = rpcReturning(async () => {
      throw new Error("rpc down");
    });
    expect(await getCurrentEpoch("mainnet", rpc.factory)).toBeNull();
    expect(await getCurrentEpoch("mainnet", rpc.factory)).toBeNull();
    expect(rpc.getEpochInfo).toHaveBeenCalledTimes(2);
  });

  it("returns null without an RPC endpoint", async () => {
    vi.stubEnv("MAINNET_RPC_ENDPOINT", "");
    const rpc = rpcReturning(async () => ({ epoch: BigInt(EPOCH) }));
    expect(await getCurrentEpoch("mainnet", rpc.factory)).toBeNull();
    expect(rpc.factory).not.toHaveBeenCalled();
  });
});

describe("getJpoolEligibility", () => {
  let rpc: ReturnType<typeof rpcReturning>;

  beforeEach(() => {
    resetEpochCacheForTests();
    vi.stubEnv("MAINNET_RPC_ENDPOINT", "https://rpc.example");
    rpc = rpcReturning(async () => ({ epoch: BigInt(EPOCH) }));
    redis.get.mockReset().mockResolvedValue(null);
    redis.set.mockReset().mockResolvedValue("OK");
    redisConfigured.value = true;
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  function run(fetchImpl: typeof fetch) {
    return getJpoolEligibility("mainnet", VOTE, {
      fetchImpl,
      rpcFactory: rpc.factory
    });
  }

  it("returns a jpool verdict and caches the facts for 6 h", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ data: [row()] }));
    await expect(run(fetchImpl)).resolves.toEqual({
      eligible: true,
      reason: null,
      epoch: EPOCH,
      source: "jpool"
    });
    expect(redis.set).toHaveBeenCalledWith(
      eligibilityResultKey("mainnet", EPOCH, VOTE),
      JSON.stringify(score()),
      { PX: ELIGIBILITY_RESULT_TTL_MS }
    );
    expect(eligibilityResultKey("mainnet", EPOCH, VOTE)).toBe(
      `jpool:v1:eligibility:result:mainnet:${EPOCH}:${VOTE}`
    );
  });

  it("caches ineligible verdicts the same way", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ data: [row({ isSuperMinority: true })] })
    );
    await expect(run(fetchImpl)).resolves.toMatchObject({
      eligible: false,
      reason: "superminority",
      source: "jpool"
    });
    expect(redis.set).toHaveBeenCalledWith(
      eligibilityResultKey("mainnet", EPOCH, VOTE),
      expect.any(String),
      { PX: ELIGIBILITY_RESULT_TTL_MS }
    );
  });

  it("serves a cached result without calling upstream", async () => {
    redis.get.mockImplementation(async (key: string) =>
      key === eligibilityResultKey("mainnet", EPOCH, VOTE)
        ? JSON.stringify(score({ isBlocked: true }))
        : null
    );
    const fetchImpl = vi.fn();
    await expect(run(fetchImpl)).resolves.toMatchObject({
      eligible: false,
      reason: "blocked",
      source: "jpool"
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("applies the membership flag to cached facts", async () => {
    vi.stubEnv("JPOOL_ELIGIBILITY_REQUIRE_MEMBERSHIP", "true");
    redis.get.mockImplementation(async (key: string) =>
      key === eligibilityResultKey("mainnet", EPOCH, VOTE)
        ? JSON.stringify(score({ isJpoolValidator: false }))
        : null
    );
    await expect(run(vi.fn())).resolves.toMatchObject({
      eligible: false,
      reason: "not_member"
    });
  });

  it.each([
    ["empty data", async () => jsonResponse({ data: [] })],
    [
      "vote mismatch",
      async () => jsonResponse({ data: [row({ voteId: OTHER_VOTE })] })
    ],
    [
      "epoch mismatch",
      async () => jsonResponse({ data: [row({ epoch: EPOCH - 1 })] })
    ],
    ["malformed", async () => jsonResponse({ rows: [] })],
    ["invalid JSON", async () => new Response("<html>", { status: 200 })],
    ["HTTP 500", async () => jsonResponse({}, 500)],
    [
      "network error",
      async () => {
        throw new TypeError("fetch failed");
      }
    ]
  ])("falls back on %s and caches it for 10 min", async (_label, impl) => {
    const fetchImpl = vi.fn(impl) as unknown as typeof fetch;
    await expect(run(fetchImpl)).resolves.toEqual({
      eligible: true,
      reason: null,
      epoch: EPOCH,
      source: "fallback"
    });
    expect(redis.set).toHaveBeenCalledTimes(1);
    expect(redis.set).toHaveBeenCalledWith(
      `jpool:v1:eligibility:fallback:mainnet:${EPOCH}:${VOTE}`,
      expect.any(String),
      { PX: ELIGIBILITY_FALLBACK_TTL_MS }
    );
  });

  it("falls back on an upstream timeout", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () =>
              reject(new Error("aborted"))
            );
          })
      );
      const pending = run(fetchImpl as typeof fetch);
      await vi.advanceTimersByTimeAsync(JPOOL_SCORES_TIMEOUT_MS);
      await expect(pending).resolves.toMatchObject({
        source: "fallback",
        epoch: EPOCH
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("serves a cached fallback without calling upstream", async () => {
    redis.get.mockImplementation(async (key: string) =>
      key === eligibilityFallbackKey("mainnet", EPOCH, VOTE)
        ? JSON.stringify({
            eligible: true,
            reason: null,
            epoch: EPOCH,
            source: "fallback"
          })
        : null
    );
    const fetchImpl = vi.fn();
    await expect(run(fetchImpl)).resolves.toMatchObject({ source: "fallback" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("prefers a result over a fallback left from earlier in the epoch", async () => {
    redis.get.mockImplementation(async (key: string) =>
      key === eligibilityResultKey("mainnet", EPOCH, VOTE)
        ? JSON.stringify(score())
        : JSON.stringify({ source: "fallback" })
    );
    await expect(run(vi.fn())).resolves.toMatchObject({ source: "jpool" });
  });

  it("falls back with epoch null when RPC is down, without calling upstream", async () => {
    rpc = rpcReturning(async () => {
      throw new Error("rpc down");
    });
    const fetchImpl = vi.fn();
    await expect(run(fetchImpl)).resolves.toEqual({
      eligible: true,
      reason: null,
      epoch: null,
      source: "fallback"
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(redis.set).toHaveBeenCalledWith(
      `jpool:v1:eligibility:fallback:mainnet:unknown:${VOTE}`,
      expect.any(String),
      { PX: ELIGIBILITY_FALLBACK_TTL_MS }
    );
  });

  it("works without Redis", async () => {
    redisConfigured.value = false;
    const fetchImpl = vi.fn(async () => jsonResponse({ data: [row()] }));
    await expect(run(fetchImpl)).resolves.toMatchObject({ source: "jpool" });
    expect(redis.get).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });

  it("ignores Redis failures", async () => {
    redis.get.mockRejectedValue(new Error("down"));
    redis.set.mockRejectedValue(new Error("down"));
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ data: [row({ isBlocked: true })] })
    );
    await expect(run(fetchImpl)).resolves.toMatchObject({
      eligible: false,
      reason: "blocked"
    });
  });
});
