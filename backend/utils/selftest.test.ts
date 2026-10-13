import { beforeEach, describe, expect, it, vi } from "vitest";

import { ValidatorStakingError } from "@/utils/errors";
import type * as GenerateModule from "@/utils/solana/stake/generate";

const WALLET = "4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T";
const VOTE = "Vote111111111111111111111111111111111111111";
const ENDPOINT = "https://mainnet.helius-rpc.com/?api-key=SECRET";

const {
  buildMock,
  buildJpoolMock,
  minimumMock,
  simulateSendMock,
  createRpcMock
} = vi.hoisted(() => {
  const simulateSendMock = vi.fn();
  return {
    buildMock: vi.fn(),
    buildJpoolMock: vi.fn(),
    minimumMock: vi.fn(),
    simulateSendMock,
    createRpcMock: vi.fn(() => ({
      simulateTransaction: vi.fn(() => ({ send: simulateSendMock }))
    }))
  };
});

vi.mock("@/utils/solana/rpc", () => ({ createRpcConnection: createRpcMock }));
vi.mock("@/utils/solana/stake/minimum", () => ({
  getStakeMinimum: minimumMock
}));
vi.mock("@/utils/solana/stake/generate", async (importOriginal) => ({
  ...(await importOriginal<typeof GenerateModule>()),
  buildNativeStakeTransaction: buildMock
}));
vi.mock("@/utils/solana/jpool/generate", () => ({
  buildJpoolDepositTransaction: buildJpoolMock
}));

import { JpoolRouteError } from "@/utils/solana/jpool/errors";
import { StakeGenerateError } from "@/utils/solana/stake/generate";
import {
  JPOOL_SELFTEST_LAMPORTS,
  redactSelftestError,
  runSelftest
} from "./selftest";

const UNSIGNED_SIMULATION = {
  encoding: "base64",
  sigVerify: false,
  replaceRecentBlockhash: true,
  commitment: "confirmed"
};

async function runNative() {
  return (await runSelftest(["native"])).checks.native;
}

async function runJpool() {
  return (await runSelftest(["jpool"])).checks.jpool;
}

beforeEach(() => {
  vi.stubEnv("SELFTEST_WALLET", WALLET);
  vi.stubEnv("SELFTEST_VOTE_ACCOUNT", "");
  vi.stubEnv("NEXT_PUBLIC_VALIDATOR_ADDRESS", VOTE);
  vi.stubEnv("MAINNET_RPC_ENDPOINT", ENDPOINT);
  createRpcMock.mockClear();
  minimumMock.mockReset().mockResolvedValue({
    minimumStakeLamports: 1_002_282_880,
    minimumStakeSol: 1.00228288
  });
  buildMock.mockReset().mockResolvedValue("wire-tx");
  buildJpoolMock.mockReset().mockResolvedValue({
    transaction: "jpool-wire-tx",
    expectedJsol: 8_123_456n
  });
  simulateSendMock.mockReset().mockResolvedValue({
    value: { err: null, logs: [], unitsConsumed: 12_345n }
  });
});

describe("runSelftest", () => {
  it("runs every check by default and passes when all pass", async () => {
    const result = await runSelftest();

    expect(result).toEqual({
      ok: true,
      network: "mainnet",
      elapsedMs: expect.any(Number),
      checks: {
        native: expect.objectContaining({ ok: true }),
        jpool: expect.objectContaining({ ok: true })
      }
    });
  });

  it("fails when one check fails and still reports the other", async () => {
    buildJpoolMock.mockRejectedValue(
      new JpoolRouteError("JPOOL_RPC_UNAVAILABLE", 503)
    );

    const result = await runSelftest();

    expect(result.ok).toBe(false);
    expect(result.checks.native).toMatchObject({ ok: true });
    expect(result.checks.jpool).toMatchObject({ ok: false, stage: "generate" });
  });

  it("runs only the requested check", async () => {
    const result = await runSelftest(["jpool"]);

    expect(Object.keys(result.checks)).toEqual(["jpool"]);
    expect(buildMock).not.toHaveBeenCalled();
  });
});

describe("native check", () => {
  it("builds a minimum stake for the wallet and simulates it unsigned", async () => {
    expect(await runNative()).toEqual({
      ok: true,
      minimumSol: 1.00228288,
      unitsConsumed: 12_345,
      elapsedMs: expect.any(Number)
    });
    expect(createRpcMock).toHaveBeenCalledWith("mainnet");
    expect(buildMock).toHaveBeenCalledWith(
      expect.objectContaining({
        network: "mainnet",
        stakeLamports: 1_002_282_880,
        authority: WALLET,
        voteAccount: VOTE,
        newAccount: expect.any(String)
      })
    );
    expect(buildMock.mock.calls[0][0].newAccount).not.toBe(WALLET);
    const simulate = createRpcMock.mock.results[0].value.simulateTransaction;
    expect(simulate).toHaveBeenCalledWith("wire-tx", UNSIGNED_SIMULATION);
  });

  it.each([
    ["SELFTEST_WALLET", "", "SELFTEST_WALLET is not set to a valid address"],
    [
      "SELFTEST_WALLET",
      "not-an-address",
      "SELFTEST_WALLET is not set to a valid address"
    ],
    [
      "NEXT_PUBLIC_VALIDATOR_ADDRESS",
      "",
      "SELFTEST_VOTE_ACCOUNT is not set to a valid address"
    ]
  ])("fails at config when %s is %j", async (name, value, error) => {
    vi.stubEnv(name, value);

    expect(await runNative()).toMatchObject({
      ok: false,
      stage: "config",
      error
    });
    expect(createRpcMock).not.toHaveBeenCalled();
  });

  it("prefers SELFTEST_VOTE_ACCOUNT over the backend validator default", async () => {
    const vote = "DeEpSdaw8uBLQ5T2HQhDf8fBSVbm13jGqJwoSF3HTpL5";
    vi.stubEnv("SELFTEST_VOTE_ACCOUNT", vote);

    await runNative();

    expect(buildMock).toHaveBeenCalledWith(
      expect.objectContaining({ voteAccount: vote })
    );
  });

  it("fails at generate when the RPC endpoint is missing", async () => {
    createRpcMock.mockImplementationOnce(() => {
      throw new ValidatorStakingError(
        "MAINNET_RPC_ENDPOINT environment variable not set",
        "RPC_ENDPOINT_MISSING"
      );
    });

    expect(await runNative()).toMatchObject({
      ok: false,
      stage: "generate",
      error: "MAINNET_RPC_ENDPOINT environment variable not set"
    });
  });

  it("fails at generate with the rejection message", async () => {
    buildMock.mockRejectedValue(
      new StakeGenerateError(
        { error: "Vote account not found on selected network" },
        400
      )
    );

    expect(await runNative()).toMatchObject({
      ok: false,
      stage: "generate",
      error: "Vote account not found on selected network"
    });
  });

  it("adds the simulated transaction error to the rejection", async () => {
    buildMock.mockRejectedValue(
      new StakeGenerateError(
        {
          error: "Stake transaction simulation failed",
          details: {
            message: "Transaction failed when it was simulated in order to …",
            cause: { InstructionError: ["2", { Custom: "1" }] }
          }
        },
        400
      )
    );

    expect(await runNative()).toMatchObject({
      stage: "generate",
      error:
        'Stake transaction simulation failed: {"InstructionError":["2",{"Custom":"1"}]}'
    });
  });

  it("fails at generate with the network error code, without the RPC URL", async () => {
    minimumMock.mockRejectedValue(
      new TypeError(`fetch failed for ${ENDPOINT}`, {
        cause: { code: "ENOTFOUND" }
      })
    );

    const result = await runNative();

    expect(result).toMatchObject({
      ok: false,
      stage: "generate",
      error: "fetch failed for <rpc> (ENOTFOUND)"
    });
    expect(JSON.stringify(result)).not.toContain("SECRET");
  });

  it("fails at simulate with the error and the last log line", async () => {
    simulateSendMock.mockResolvedValue({
      value: {
        err: { InstructionError: [2, { Custom: 1n }] },
        logs: ["first", "insufficient lamports"],
        unitsConsumed: 0n
      }
    });

    expect(await runNative()).toMatchObject({
      ok: false,
      stage: "simulate",
      error: '{"InstructionError":[2,{"Custom":"1"}]}: insufficient lamports'
    });
  });

  it("fails at simulate when the simulation request throws", async () => {
    simulateSendMock.mockRejectedValue(new Error("HTTP error (429)"));

    expect(await runNative()).toMatchObject({
      ok: false,
      stage: "simulate",
      error: "HTTP error (429)"
    });
  });

  it("times out after 10 seconds at the stage that hangs", async () => {
    vi.useFakeTimers();
    try {
      buildMock.mockReturnValue(new Promise(() => undefined));
      const pending = runNative();
      await vi.advanceTimersByTimeAsync(10_000);

      expect(await pending).toMatchObject({
        ok: false,
        stage: "generate",
        error: "timeout"
      });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("jpool check", () => {
  it("builds a deposit for the wallet and simulates it unsigned", async () => {
    expect(await runJpool()).toEqual({
      ok: true,
      depositSol: 0.01,
      expectedJsol: "8123456",
      unitsConsumed: 12_345,
      elapsedMs: expect.any(Number)
    });
    expect(buildJpoolMock).toHaveBeenCalledWith({
      network: "mainnet",
      wallet: WALLET,
      voteAccount: VOTE,
      lamports: JPOOL_SELFTEST_LAMPORTS
    });
    const simulate = createRpcMock.mock.results[0].value.simulateTransaction;
    expect(simulate).toHaveBeenCalledWith("jpool-wire-tx", UNSIGNED_SIMULATION);
  });

  it("passes with skipped while JPool updates for a new epoch", async () => {
    buildJpoolMock.mockRejectedValue(
      new JpoolRouteError("JPOOL_POOL_UPDATING", 503)
    );

    expect(await runJpool()).toEqual({
      ok: true,
      skipped: "JPOOL_POOL_UPDATING",
      elapsedMs: expect.any(Number)
    });
  });

  it("fails at generate with the JPool code and simulation error", async () => {
    buildJpoolMock.mockRejectedValue(
      new JpoolRouteError("JPOOL_INSUFFICIENT_FUNDS", 400, {
        err: { InstructionError: [1, { Custom: 1n }] }
      })
    );

    expect(await runJpool()).toMatchObject({
      ok: false,
      stage: "generate",
      error: 'JPOOL_INSUFFICIENT_FUNDS: {"InstructionError":[1,{"Custom":"1"}]}'
    });
  });

  it("fails at generate with the JPool message when there are no details", async () => {
    buildJpoolMock.mockRejectedValue(
      new JpoolRouteError("JPOOL_DEPOSITS_RESTRICTED", 503)
    );

    expect(await runJpool()).toMatchObject({
      ok: false,
      stage: "generate",
      error:
        "JPOOL_DEPOSITS_RESTRICTED: Deposits to JPool are paused right now. Please try again later."
    });
  });

  it("fails at simulate when the final transaction fails", async () => {
    simulateSendMock.mockResolvedValue({
      value: { err: "BlockhashNotFound", logs: null, unitsConsumed: null }
    });

    expect(await runJpool()).toMatchObject({
      ok: false,
      stage: "simulate",
      error: '"BlockhashNotFound"'
    });
  });
});

describe("redactSelftestError", () => {
  it("removes configured endpoints, their hosts and api keys", () => {
    vi.stubEnv("DEVNET_RPC_ENDPOINT", "https://devnet.example/rpc");

    expect(
      redactSelftestError(
        `a ${ENDPOINT} b mainnet.helius-rpc.com c devnet.example d https://x.io/?api-key=OTHER&y=1`
      )
    ).toBe("a <rpc> b <rpc> c <rpc> d https://x.io/?api-key=<redacted>&y=1");
  });

  it("truncates long messages", () => {
    expect(redactSelftestError("x".repeat(400))).toHaveLength(301);
  });
});
