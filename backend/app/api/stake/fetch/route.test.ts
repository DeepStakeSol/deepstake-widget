import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { addressMock, createRpcConnectionMock, getStakeAccountsMock, ValidatorStakingErrorMock } =
  vi.hoisted(() => {
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
      addressMock: vi.fn((value: string) => value),
      createRpcConnectionMock: vi.fn(() => ({ rpc: true })),
      getStakeAccountsMock: vi.fn(),
      ValidatorStakingErrorMock,
    };
  });

vi.mock("@solana/kit", () => ({
  address: addressMock,
}));

vi.mock("@/utils/errors", () => ({
  ValidatorStakingError: ValidatorStakingErrorMock,
}));

vi.mock("@/utils/solana/rpc", () => ({
  createRpcConnection: createRpcConnectionMock,
}));

vi.mock("@/utils/solana/stake/get-stake-accounts", () => ({
  getStakeAccounts: getStakeAccountsMock,
}));

const ValidatorStakingError = ValidatorStakingErrorMock;
import { GET } from "./route";

function request(url: string) {
  return { nextUrl: new URL(url) } as unknown as NextRequest;
}

describe("GET /api/stake/fetch", () => {
  beforeEach(() => {
    addressMock.mockClear();
    createRpcConnectionMock.mockClear();
    getStakeAccountsMock.mockReset();
  });

  it("requires an owner address", async () => {
    const response = await GET(request("http://localhost/api/stake/fetch?network=devnet"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Owner address parameter is required" });
  });

  it("returns stake accounts for an owner", async () => {
    const stakeAccounts = [{ address: "stake-account" }];
    getStakeAccountsMock.mockResolvedValue(stakeAccounts);

    const response = await GET(
      request("http://localhost/api/stake/fetch?network=devnet&owner=owner-address")
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ stakeAccounts });
    expect(createRpcConnectionMock).toHaveBeenCalledWith("devnet");
    expect(getStakeAccountsMock).toHaveBeenCalledWith({
      rpc: { rpc: true },
      owner: "owner-address",
      vote: undefined,
    });
  });

  it("passes an optional vote account filter", async () => {
    getStakeAccountsMock.mockResolvedValue([]);

    await GET(
      request("http://localhost/api/stake/fetch?network=mainnet&owner=owner-address&vote=vote-address")
    );

    expect(getStakeAccountsMock).toHaveBeenCalledWith({
      rpc: { rpc: true },
      owner: "owner-address",
      vote: "vote-address",
    });
  });

  it("maps validator staking errors to 400", async () => {
    getStakeAccountsMock.mockRejectedValue(
      new ValidatorStakingError("RPC missing", "RPC_ENDPOINT_MISSING", { network: "devnet" })
    );

    const response = await GET(
      request("http://localhost/api/stake/fetch?network=devnet&owner=owner-address")
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "RPC missing",
      code: "RPC_ENDPOINT_MISSING",
      details: { network: "devnet" },
    });
  });

  it("maps generic errors to 500", async () => {
    getStakeAccountsMock.mockRejectedValue(new Error("boom"));

    const response = await GET(
      request("http://localhost/api/stake/fetch?network=devnet&owner=owner-address")
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Failed to fetch stake accounts" });
  });
});
