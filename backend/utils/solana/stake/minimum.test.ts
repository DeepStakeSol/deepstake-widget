import type { Rpc, SolanaRpcApi } from "@solana/kit";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearStakeMinimumCache,
  getStakeMinimum,
  STAKE_MINIMUM_CACHE_TTL_MS
} from "./minimum";

const rentSend = vi.fn();
const delegationSend = vi.fn();
const rpc = {
  getMinimumBalanceForRentExemption: vi.fn(() => ({ send: rentSend })),
  getStakeMinimumDelegation: vi.fn(() => ({ send: delegationSend }))
} as unknown as Rpc<SolanaRpcApi>;

describe("getStakeMinimum", () => {
  beforeEach(() => {
    clearStakeMinimumCache();
    vi.clearAllMocks();
    rentSend.mockResolvedValue(BigInt(2_282_880));
    delegationSend.mockResolvedValue({ value: BigInt(1_000_000_000) });
  });

  it("combines rent and delegation and deduplicates concurrent requests", async () => {
    const [first, second] = await Promise.all([
      getStakeMinimum("mainnet", rpc),
      getStakeMinimum("mainnet", rpc)
    ]);

    expect(first).toEqual({
      network: "mainnet",
      minimumDelegation: 1_000_000_000,
      rentExemptReserve: 2_282_880,
      minimumStakeLamports: 1_002_282_880,
      minimumStakeSol: 1.00228288
    });
    expect(second).toBe(first);
    expect(rentSend).toHaveBeenCalledTimes(1);
    expect(delegationSend).toHaveBeenCalledTimes(1);
  });

  it("caches each network for fifteen minutes", async () => {
    let now = 1_000;
    await getStakeMinimum("devnet", rpc, () => now);
    now += STAKE_MINIMUM_CACHE_TTL_MS - 1;
    await getStakeMinimum("devnet", rpc, () => now);
    expect(rentSend).toHaveBeenCalledTimes(1);

    now += 1;
    await getStakeMinimum("devnet", rpc, () => now);
    expect(rentSend).toHaveBeenCalledTimes(2);
  });

  it("does not cache failed requests", async () => {
    rentSend.mockRejectedValueOnce(new Error("rpc unavailable"));

    await expect(getStakeMinimum("mainnet", rpc)).rejects.toThrow(
      "rpc unavailable"
    );
    await expect(getStakeMinimum("mainnet", rpc)).resolves.toMatchObject({
      minimumStakeLamports: 1_002_282_880
    });
    expect(rentSend).toHaveBeenCalledTimes(2);
  });
});
