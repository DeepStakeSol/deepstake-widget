import { afterEach, describe, expect, it, vi } from "vitest";

import fixtures from "@/test/fixtures/jpool-api.json";

import {
  fetchJpoolDirectStakes,
  fetchJpoolWalletBinding,
  JPOOL_API_TIMEOUT_MS,
  JpoolApiError,
  parseDirectStakes,
  parseJpoolAmount,
  parseWalletBinding
} from "./api";

const VOTE = "DeEpSdaw8uBLQ5T2HQhDf8fBSVbm13jGqJwoSF3HTpL5";
const OTHER_VOTE = "Vote111111111111111111111111111111111111111";
const WALLET = "4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe("parseJpoolAmount", () => {
  it.each([
    ["7264213", BigInt(7264213)],
    [7264213, BigInt(7264213)],
    ["0", BigInt(0)],
    ["18446744073709551615", BigInt("18446744073709551615")]
  ])("parses %j", (value, expected) => {
    expect(parseJpoolAmount(value)).toBe(expected);
  });

  it.each([[-1], [1.5], [2 ** 53], ["1.5"], ["-1"], [""], [null], [undefined]])(
    "rejects %j",
    (value) => {
      expect(parseJpoolAmount(value)).toBeNull();
    }
  );
});

describe("parseWalletBinding", () => {
  it("reads null as not bound", () => {
    expect(parseWalletBinding(null)).toBeNull();
  });

  it("parses a binding with boundTo and a string amount", () => {
    expect(parseWalletBinding(fixtures.bindingBoundHere)).toEqual({
      voteId: VOTE,
      amount: BigInt(0),
      updatedAt: "2026-09-22T10:00:00.000Z"
    });
  });

  it("accepts a numeric amount and a missing boundTo", () => {
    expect(parseWalletBinding(fixtures.bindingElsewhereNumberAmount)).toEqual({
      voteId: OTHER_VOTE,
      amount: BigInt(1500000000),
      updatedAt: "2026-09-21T10:00:00.000Z"
    });
  });

  it("keeps the binding when only the amount is unreadable", () => {
    expect(
      parseWalletBinding({ voteId: VOTE, amount: "n/a" })
    ).toEqual({ voteId: VOTE, amount: null, updatedAt: null });
  });

  it.each([
    ["voteId vs boundTo mismatch", fixtures.bindingMismatch],
    ["missing voteId", { amount: "0" }],
    ["invalid voteId", { voteId: "not-a-key" }],
    ["array", []],
    ["string", "bound"]
  ])("rejects %s as malformed", (_label, body) => {
    expect(() => parseWalletBinding(body)).toThrow(JpoolApiError);
  });
});

describe("parseDirectStakes", () => {
  it("parses string and number amounts and stringifies ids", () => {
    expect(parseDirectStakes(fixtures.directStakes, VOTE)).toEqual([
      {
        id: "842",
        voteId: VOTE,
        poolTokenAmount: BigInt(7264213),
        balanceAmount: BigInt(7264213),
        availableAmount: BigInt(7264213),
        createdAt: "2026-09-20T10:00:04.000Z"
      },
      {
        id: "843",
        voteId: VOTE,
        poolTokenAmount: BigInt(1000),
        balanceAmount: BigInt(1000),
        availableAmount: BigInt(500),
        createdAt: "2026-09-23T10:00:00.000Z"
      }
    ]);
  });

  it("reads [] and null as no records", () => {
    expect(parseDirectStakes([], VOTE)).toEqual([]);
    expect(parseDirectStakes(null, VOTE)).toEqual([]);
  });

  it("drops records for other vote accounts", () => {
    expect(
      parseDirectStakes(
        [{ ...fixtures.directStakes[0], voteId: OTHER_VOTE }],
        VOTE
      )
    ).toEqual([]);
  });

  it.each([
    ["object instead of array", { data: [] }],
    ["record without availableAmount", [{ voteId: VOTE }]],
    ["record without voteId", [{ availableAmount: "1" }]]
  ])("rejects %s as malformed", (_label, body) => {
    expect(() => parseDirectStakes(body, VOTE)).toThrow(JpoolApiError);
  });
});

describe("JPool API requests", () => {
  afterEach(() => vi.useRealTimers());

  it("requests the binding and find endpoints", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(null))
      .mockResolvedValueOnce(jsonResponse(fixtures.directStakes));
    await expect(fetchJpoolWalletBinding(WALLET, fetchMock)).resolves.toBeNull();
    await expect(
      fetchJpoolDirectStakes(WALLET, VOTE, fetchMock)
    ).resolves.toHaveLength(2);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      `https://api2.jpool.one/direct-stake/wallet-binding/${WALLET}`,
      `https://api2.jpool.one/direct-stake/find?wallet=${WALLET}&voteId=${VOTE}`
    ]);
  });

  it("classifies HTTP, JSON and network failures", async () => {
    const cases: Array<[Promise<Response> | Response, string]> = [
      [jsonResponse({ message: "down" }, 502), "http"],
      [new Response("<html>", { status: 200 }), "malformed"],
      [Promise.reject(new TypeError("fetch failed")), "network"]
    ];
    for (const [response, kind] of cases) {
      const fetchMock = vi.fn(() => response);
      await expect(
        fetchJpoolWalletBinding(WALLET, fetchMock as never)
      ).rejects.toMatchObject({ kind });
    }
  });

  it("aborts after the timeout", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError"))
          );
        })
    );
    const pending = fetchJpoolWalletBinding(WALLET, fetchMock as never);
    const assertion = expect(pending).rejects.toMatchObject({ kind: "timeout" });
    await vi.advanceTimersByTimeAsync(JPOOL_API_TIMEOUT_MS);
    await assertion;
  });
});
