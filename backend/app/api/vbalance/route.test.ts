import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  ConnectionMock,
  getAssociatedTokenAddressSyncMock,
  getBalanceMock,
  getRpcEndpointMock,
  getTokenAccountBalanceMock,
  ValidatorStakingErrorMock,
} = vi.hoisted(() => {
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
  const getBalanceMock = vi.fn();
  const getTokenAccountBalanceMock = vi.fn();
  class ConnectionMock {
    getBalance = getBalanceMock;
    getTokenAccountBalance = getTokenAccountBalanceMock;
  }
  return {
    ConnectionMock,
    getAssociatedTokenAddressSyncMock: vi.fn(() => "lst-ata"),
    getBalanceMock,
    getRpcEndpointMock: vi.fn(() => "https://rpc.example"),
    getTokenAccountBalanceMock,
    ValidatorStakingErrorMock,
  };
});

vi.mock("@solana/web3.js", () => ({
  Connection: ConnectionMock,
  PublicKey: class PublicKey {
    constructor(public readonly value: string) {}
  },
}));

vi.mock("@solana/spl-token", () => ({
  getAssociatedTokenAddressSync: getAssociatedTokenAddressSyncMock,
}));

vi.mock("@/utils/solana/rpc", () => ({
  getRpcEndpoint: getRpcEndpointMock,
}));

vi.mock("@/utils/errors", () => ({
  ValidatorStakingError: ValidatorStakingErrorMock,
}));

const ValidatorStakingError = ValidatorStakingErrorMock;
import { GET } from "./route";

function request(url: string) {
  return { nextUrl: new URL(url) } as unknown as NextRequest;
}

describe("GET /api/vbalance", () => {
  beforeEach(() => {
    getRpcEndpointMock.mockReset().mockReturnValue("https://rpc.example");
    getBalanceMock.mockReset().mockResolvedValue(BigInt(123));
    getTokenAccountBalanceMock.mockReset().mockResolvedValue({ value: { amount: "456" } });
    getAssociatedTokenAddressSyncMock.mockClear();
  });

  it("requires an address", async () => {
    const response = await GET(request("http://localhost/api/vbalance?network=devnet&mint=mint"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Address parameter is required" });
  });

  it("requires a mint", async () => {
    const response = await GET(request("http://localhost/api/vbalance?network=devnet&address=wallet"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "mint parameter is required" });
  });

  it("returns SOL and LST balances", async () => {
    const response = await GET(
      request("http://localhost/api/vbalance?network=devnet&address=wallet&mint=mint")
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ sol: "123", lst: "456" });
    expect(getRpcEndpointMock).toHaveBeenCalledWith("devnet");
    expect(getAssociatedTokenAddressSyncMock).toHaveBeenCalled();
  });

  it("returns zero LST balance when the token account is missing", async () => {
    getTokenAccountBalanceMock.mockRejectedValue(new Error("missing"));

    const response = await GET(
      request("http://localhost/api/vbalance?network=devnet&address=wallet&mint=mint")
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ sol: "123", lst: "0" });
  });

  it("maps typed and generic errors", async () => {
    getRpcEndpointMock.mockImplementationOnce(() => {
      throw new ValidatorStakingError("bad network", "INVALID_NETWORK_ENV", { network: "bad" });
    });

    const typed = await GET(request("http://localhost/api/vbalance?network=bad&address=wallet&mint=mint"));
    expect(typed.status).toBe(400);
    await expect(typed.json()).resolves.toEqual({
      error: "bad network",
      code: "INVALID_NETWORK_ENV",
      details: { network: "bad" },
    });

    getRpcEndpointMock.mockImplementationOnce(() => "");
    const generic = await GET(request("http://localhost/api/vbalance?network=devnet&address=wallet&mint=mint"));
    expect(generic.status).toBe(500);
    await expect(generic.json()).resolves.toEqual({ error: "Failed to fetch vbalance" });
  });
});
