import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class ValidatorStakingError extends Error {
    constructor(
      message: string,
      public readonly code?: string,
      public readonly details?: Record<string, unknown>
    ) {
      super(message);
      this.name = "ValidatorStakingError";
    }
  }
  return {
    ValidatorStakingError,
    createRpcConnection: vi.fn(),
    findAssociatedTokenPda: vi.fn(),
    getBalanceSend: vi.fn(),
    getTokenAccountBalanceSend: vi.fn()
  };
});

vi.mock("@solana/kit", () => ({
  address: vi.fn((value: string) => value)
}));
vi.mock("@solana-program/token", () => ({
  TOKEN_PROGRAM_ADDRESS: "token-program",
  findAssociatedTokenPda: mocks.findAssociatedTokenPda
}));
vi.mock("@/utils/solana/rpc", () => ({
  createRpcConnection: mocks.createRpcConnection
}));
vi.mock("@/utils/errors", () => ({
  ValidatorStakingError: mocks.ValidatorStakingError
}));

import { GET } from "./route";

function request(url: string) {
  return { nextUrl: new URL(url) } as unknown as NextRequest;
}

const baseUrl =
  "http://localhost/api/vbalance?network=devnet&address=wallet&mint=mint";

describe("GET /api/vbalance", () => {
  beforeEach(() => {
    mocks.createRpcConnection.mockReset().mockReturnValue({
      getBalance: vi.fn(() => ({ send: mocks.getBalanceSend })),
      getTokenAccountBalance: vi.fn(() => ({
        send: mocks.getTokenAccountBalanceSend
      }))
    });
    mocks.findAssociatedTokenPda
      .mockReset()
      .mockResolvedValue(["lst-ata", 255]);
    mocks.getBalanceSend.mockReset().mockResolvedValue({ value: BigInt(123) });
    mocks.getTokenAccountBalanceSend
      .mockReset()
      .mockResolvedValue({ value: { amount: "456" } });
  });

  it("requires an address", async () => {
    const response = await GET(
      request("http://localhost/api/vbalance?network=devnet&mint=mint")
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Address parameter is required"
    });
  });

  it("requires a mint", async () => {
    const response = await GET(
      request("http://localhost/api/vbalance?network=devnet&address=wallet")
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "mint parameter is required"
    });
  });

  it("returns SOL and LST balances", async () => {
    const response = await GET(request(baseUrl));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ sol: "123", lst: "456" });
    expect(mocks.createRpcConnection).toHaveBeenCalledWith("devnet");
    expect(mocks.findAssociatedTokenPda).toHaveBeenCalledWith({
      owner: "wallet",
      mint: "mint",
      tokenProgram: "token-program"
    });
  });

  it("returns zero LST balance when the token account is missing", async () => {
    mocks.getTokenAccountBalanceSend.mockRejectedValue(new Error("missing"));
    const response = await GET(request(baseUrl));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ sol: "123", lst: "0" });
  });

  it("maps typed and generic errors", async () => {
    mocks.createRpcConnection.mockImplementationOnce(() => {
      throw new mocks.ValidatorStakingError(
        "bad network",
        "INVALID_NETWORK_ENV",
        { network: "bad" }
      );
    });
    const typed = await GET(request(baseUrl.replace("devnet", "bad")));
    expect(typed.status).toBe(400);
    await expect(typed.json()).resolves.toEqual({
      error: "bad network",
      code: "INVALID_NETWORK_ENV",
      details: { network: "bad" }
    });

    mocks.createRpcConnection.mockImplementationOnce(() => {
      throw new Error("rpc failed");
    });
    const generic = await GET(request(baseUrl));
    expect(generic.status).toBe(500);
    await expect(generic.json()).resolves.toEqual({
      error: "Failed to fetch vbalance"
    });
  });
});
