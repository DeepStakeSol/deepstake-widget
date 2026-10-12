import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_PRIORITY_FEE_MICRO_LAMPORTS } from "./constants";
import { getPriorityFeeEstimate } from "./priorityFee";

const transaction = { serialize: () => Uint8Array.from([0, 1, 2, 3]) };

function estimate() {
  return getPriorityFeeEstimate("Medium", transaction, "https://rpc.example");
}

describe("getPriorityFeeEstimate", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("encodes the wire transaction with Kit base58", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ result: { priorityFeeEstimate: 321 } })
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(estimate()).resolves.toEqual({ priorityFeeEstimate: 321 });

    expect(fetchMock).toHaveBeenCalledWith("https://rpc.example", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "1",
        method: "getPriorityFeeEstimate",
        params: [
          {
            transaction: "1Ldp",
            options: { priorityLevel: "Medium" }
          }
        ]
      })
    });
  });

  it("rounds a fractional estimate up to whole micro-lamports", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ result: { priorityFeeEstimate: 12.3 } })
      })
    );

    await expect(estimate()).resolves.toEqual({ priorityFeeEstimate: 13 });
  });

  it.each([
    [
      "a JSON-RPC error from a non-Helius RPC",
      {
        ok: true,
        json: () =>
          Promise.resolve({ error: { code: -32601, message: "Method not found" } })
      }
    ],
    [
      "a non-JSON body",
      { ok: true, json: () => Promise.reject(new SyntaxError("Unexpected token")) }
    ],
    ["HTTP 500", { ok: false, status: 500, json: () => Promise.resolve({}) }],
    [
      "a non-numeric estimate",
      { ok: true, json: () => Promise.resolve({ result: { priorityFeeEstimate: "1" } }) }
    ],
    [
      "a negative estimate",
      { ok: true, json: () => Promise.resolve({ result: { priorityFeeEstimate: -5 } }) }
    ]
  ])("returns the default fee for %s", async (_label, response) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    await expect(estimate()).resolves.toEqual({
      priorityFeeEstimate: DEFAULT_PRIORITY_FEE_MICRO_LAMPORTS
    });
  });

  it("returns the default fee when the request itself fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

    await expect(estimate()).resolves.toEqual({
      priorityFeeEstimate: DEFAULT_PRIORITY_FEE_MICRO_LAMPORTS
    });
  });
});
