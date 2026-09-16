import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createRpcConnectionMock, getStakeMinimumMock } = vi.hoisted(() => ({
  createRpcConnectionMock: vi.fn(() => "rpc"),
  getStakeMinimumMock: vi.fn()
}));

vi.mock("@/utils/solana/rpc", () => ({
  createRpcConnection: createRpcConnectionMock
}));
vi.mock("@/utils/solana/stake/minimum", () => ({
  getStakeMinimum: getStakeMinimumMock,
  STAKE_MINIMUM_CACHE_TTL_MS: 900_000
}));

import { GET } from "./route";

function request(url: string) {
  return { nextUrl: new URL(url) } as unknown as NextRequest;
}

describe("GET /api/stake/minimum", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getStakeMinimumMock.mockResolvedValue({
      network: "mainnet",
      minimumDelegation: 1_000_000_000,
      rentExemptReserve: 2_282_880,
      minimumStakeLamports: 1_002_282_880,
      minimumStakeSol: 1.00228288
    });
  });

  it("requires mainnet or devnet", async () => {
    const missing = await GET(
      request("http://localhost/api/stake/minimum")
    );
    expect(missing.status).toBe(400);
    await expect(missing.json()).resolves.toEqual({
      error: "network must be mainnet or devnet"
    });

    const invalid = await GET(
      request("http://localhost/api/stake/minimum?network=testnet")
    );
    expect(invalid.status).toBe(400);
    expect(createRpcConnectionMock).not.toHaveBeenCalled();
  });

  it("returns the cached network minimum", async () => {
    const response = await GET(
      request("http://localhost/api/stake/minimum?network=mainnet")
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=900"
    );
    await expect(response.json()).resolves.toMatchObject({
      network: "mainnet",
      minimumStakeLamports: 1_002_282_880
    });
    expect(createRpcConnectionMock).toHaveBeenCalledWith("mainnet");
    expect(getStakeMinimumMock).toHaveBeenCalledWith("mainnet", "rpc");
  });

  it("returns a safe error when RPC lookup fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    getStakeMinimumMock.mockRejectedValue(new Error("rpc unavailable"));

    const response = await GET(
      request("http://localhost/api/stake/minimum?network=devnet")
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to fetch stake minimum"
    });
  });
});
