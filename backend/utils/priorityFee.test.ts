import { afterEach, describe, expect, it, vi } from "vitest";

import { getPriorityFeeEstimate } from "./priorityFee";

describe("getPriorityFeeEstimate", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("encodes the wire transaction with Kit base58", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ result: { priorityFeeEstimate: 321 } })
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getPriorityFeeEstimate(
        "Medium",
        { serialize: () => Uint8Array.from([0, 1, 2, 3]) },
        "https://rpc.example"
      )
    ).resolves.toEqual({ priorityFeeEstimate: 321 });

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
});
