import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  ConnectionMock,
  getAssociatedTokenAddressSyncMock,
  getRpcEndpointMock,
  getStakebotStakeMock,
  getTokenAccountBalanceMock,
  getVaultBindingMock,
  PublicKeyMock,
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
  const getTokenAccountBalanceMock = vi.fn();
  class ConnectionMock {
    getTokenAccountBalance = getTokenAccountBalanceMock;
  }
  class PublicKeyMock {
    constructor(public readonly value: string) {
      if (value === "invalid") throw new Error("bad key");
    }
  }
  return {
    ConnectionMock,
    getAssociatedTokenAddressSyncMock: vi.fn(() => "vsol-ata"),
    getRpcEndpointMock: vi.fn(() => "https://rpc.example"),
    getStakebotStakeMock: vi.fn(),
    getTokenAccountBalanceMock,
    getVaultBindingMock: vi.fn(),
    PublicKeyMock,
    ValidatorStakingErrorMock,
  };
});

vi.mock("@solana/web3.js", () => ({
  Connection: ConnectionMock,
  PublicKey: PublicKeyMock,
}));

vi.mock("@solana/spl-token", () => ({
  getAssociatedTokenAddressSync: getAssociatedTokenAddressSyncMock,
}));

vi.mock("@/utils/errors", () => ({
  ValidatorStakingError: ValidatorStakingErrorMock,
}));

vi.mock("@/utils/solana/rpc", () => ({
  getRpcEndpoint: getRpcEndpointMock,
}));

vi.mock("@/utils/consts", () => ({
  VSOL_MINT: "vsol-mint",
}));

vi.mock("@/utils/vaultBinding", () => ({
  getVaultBinding: getVaultBindingMock,
}));

vi.mock("@/utils/stakebot", () => ({
  getStakebotStake: getStakebotStakeMock,
}));

const ValidatorStakingError = ValidatorStakingErrorMock;
import { GET } from "./route";

function request(url: string) {
  return { nextUrl: new URL(url) } as unknown as NextRequest;
}

describe("GET /api/blaze/manage/vault", () => {
  beforeEach(() => {
    getRpcEndpointMock.mockReset().mockReturnValue("https://rpc.example");
    getVaultBindingMock.mockReset().mockResolvedValue({ hasBinding: true, stakeTarget: "vote" });
    getStakebotStakeMock.mockReset().mockResolvedValue({
      found: true,
      generatedStake: "generated",
      epoch: 12,
      sourceFile: "file.json",
      sourceUrl: "https://source.example",
    });
    getTokenAccountBalanceMock.mockReset().mockResolvedValue({ value: { amount: "1500000000" } });
  });

  it("requires and validates wallet", async () => {
    const missing = await GET(request("http://localhost/api/blaze/manage/vault"));
    expect(missing.status).toBe(400);
    await expect(missing.json()).resolves.toEqual({ error: "wallet parameter is required" });

    const invalid = await GET(request("http://localhost/api/blaze/manage/vault?wallet=invalid"));
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toEqual({ error: "Invalid wallet address" });
  });

  it("returns ready status when binding, balance, and stakebot data exist", async () => {
    const response = await GET(request("http://localhost/api/blaze/manage/vault?wallet=wallet&network=devnet"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      wallet: "wallet",
      binding: { hasBinding: true, validatorVoteKey: "vote" },
      balance: { vsol: "1500000000" },
      stakebot: { found: true, generatedStake: "generated" },
      uiStatus: "ready",
    });
  });

  it("returns no_binding, low_balance, and updating statuses", async () => {
    getVaultBindingMock.mockResolvedValueOnce({ hasBinding: false });
    const noBinding = await GET(request("http://localhost/api/blaze/manage/vault?wallet=wallet"));
    await expect(noBinding.json()).resolves.toMatchObject({ uiStatus: "no_binding" });

    getTokenAccountBalanceMock.mockResolvedValueOnce({ value: { amount: "500000000" } });
    const lowBalance = await GET(request("http://localhost/api/blaze/manage/vault?wallet=wallet"));
    await expect(lowBalance.json()).resolves.toMatchObject({ uiStatus: "low_balance" });

    getStakebotStakeMock.mockResolvedValueOnce({ found: false });
    const updating = await GET(request("http://localhost/api/blaze/manage/vault?wallet=wallet"));
    await expect(updating.json()).resolves.toMatchObject({ uiStatus: "updating" });
  });

  it("requires a configured RPC endpoint", async () => {
    getRpcEndpointMock.mockReturnValue("");

    const response = await GET(request("http://localhost/api/blaze/manage/vault?wallet=wallet"));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "RPC endpoint not configured" });
  });

  it("maps typed and generic errors", async () => {
    getVaultBindingMock.mockRejectedValueOnce(
      new ValidatorStakingError("binding failed", "BINDING_FAILED", { wallet: "wallet" })
    );

    const typed = await GET(request("http://localhost/api/blaze/manage/vault?wallet=wallet"));
    expect(typed.status).toBe(400);
    await expect(typed.json()).resolves.toEqual({
      error: "binding failed",
      code: "BINDING_FAILED",
      details: { wallet: "wallet" },
    });

    getVaultBindingMock.mockRejectedValueOnce(new Error("boom"));
    const generic = await GET(request("http://localhost/api/blaze/manage/vault?wallet=wallet"));
    expect(generic.status).toBe(500);
    await expect(generic.json()).resolves.toEqual({ error: "Failed to fetch vault manage data" });
  });
});
