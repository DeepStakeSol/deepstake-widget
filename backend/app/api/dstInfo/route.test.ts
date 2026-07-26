import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createRpcConnection: vi.fn(() => "rpc"),
  getAllDSTs: vi.fn(),
  getMetadata: vi.fn(),
  getRpcEndpoint: vi.fn(() => "https://rpc.example")
}));

vi.mock("@/utils/errors", () => ({
  ValidatorStakingError: class ValidatorStakingError extends Error {}
}));
vi.mock("@/utils/dstFetch", () => ({ getAllDSTs: mocks.getAllDSTs }));
vi.mock("@/utils/metadataFetch", () => ({ getMetadata: mocks.getMetadata }));
vi.mock("@/utils/solana/rpc", () => ({
  createRpcConnection: mocks.createRpcConnection,
  getRpcEndpoint: mocks.getRpcEndpoint
}));

import { GET } from "./route";

function request(url: string) {
  return { nextUrl: new URL(url) } as unknown as NextRequest;
}

describe("GET /api/dstInfo", () => {
  beforeEach(() => {
    mocks.createRpcConnection.mockClear();
    mocks.getRpcEndpoint.mockReset().mockReturnValue("https://rpc.example");
    mocks.getAllDSTs
      .mockReset()
      .mockResolvedValue([
        { address: "dst", data: { tokenMint: "mint", amount: BigInt(12) } }
      ]);
    mocks.getMetadata.mockReset().mockResolvedValue({ name: "DST" });
  });

  it("returns the existing metadata and DST response shape", async () => {
    const response = await GET(
      request("http://localhost/api/dstInfo?network=mainnet&mint=mint")
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      metadata: { name: "DST" },
      dst: { address: "dst", data: { tokenMint: "mint", amount: "12" } }
    });
    expect(mocks.createRpcConnection).toHaveBeenCalledWith("mainnet");
    expect(mocks.getMetadata).toHaveBeenCalledWith("mint", "rpc");
  });

  it("returns 404 for a missing DST or metadata", async () => {
    mocks.getAllDSTs.mockResolvedValue([]);
    let response = await GET(request("http://localhost/api/dstInfo?mint=mint"));
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "DST not found" });

    mocks.getAllDSTs.mockResolvedValue([
      { address: "dst", data: { tokenMint: "mint" } }
    ]);
    mocks.getMetadata.mockResolvedValue(undefined);
    response = await GET(request("http://localhost/api/dstInfo?mint=mint"));
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Metadata not found"
    });
  });

  it("rejects invalid networks and maps provider failures", async () => {
    let response = await GET(
      request("http://localhost/api/dstInfo?network=invalid&mint=mint")
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid network"
    });

    mocks.getAllDSTs.mockRejectedValue(new Error("rpc failed"));
    response = await GET(request("http://localhost/api/dstInfo?mint=mint"));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to fetch DST"
    });
  });
});
