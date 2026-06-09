import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createRpcConnectionMock, getBalanceMock, ValidatorStakingErrorMock } = vi.hoisted(() => {
  class ValidatorStakingErrorMock extends Error {
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
    createRpcConnectionMock: vi.fn(() => ({ rpc: true })),
    getBalanceMock: vi.fn(),
    ValidatorStakingErrorMock,
  };
});

vi.mock("@/utils/solana/rpc", () => ({
  createRpcConnection: createRpcConnectionMock,
}));

vi.mock("@/utils/solana/balance", () => ({
  getBalance: getBalanceMock,
}));

vi.mock("@/utils/errors", () => ({
  ValidatorStakingError: ValidatorStakingErrorMock,
}));

const ValidatorStakingError = ValidatorStakingErrorMock;
import { GET } from "./route";

function request(url: string) {
  return { nextUrl: new URL(url) } as unknown as NextRequest;
}

describe("GET /api/balance", () => {
  beforeEach(() => {
    createRpcConnectionMock.mockClear();
    getBalanceMock.mockReset();
  });

  it("requires an address", async () => {
    const response = await GET(request("http://localhost/api/balance?network=devnet"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Address parameter is required" });
  });

  it("returns a SOL balance", async () => {
    getBalanceMock.mockResolvedValue(BigInt(2_500_000_000));

    const response = await GET(
      request("http://localhost/api/balance?network=devnet&address=11111111111111111111111111111111")
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ solBalance: 2.5 });
    expect(createRpcConnectionMock).toHaveBeenCalledWith("devnet");
  });

  it("maps validator staking errors to 400", async () => {
    getBalanceMock.mockRejectedValue(
      new ValidatorStakingError("RPC missing", "RPC_ENDPOINT_MISSING", { network: "devnet" })
    );

    const response = await GET(
      request("http://localhost/api/balance?network=devnet&address=11111111111111111111111111111111")
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "RPC missing",
      code: "RPC_ENDPOINT_MISSING",
      details: { network: "devnet" },
    });
  });
});
