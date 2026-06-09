import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSolanaRpcMock, ValidatorStakingErrorMock } = vi.hoisted(() => {
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
    createSolanaRpcMock: vi.fn((endpoint: string) => ({ endpoint })),
    ValidatorStakingErrorMock,
  };
});

vi.mock("@solana/kit", () => ({
  createSolanaRpc: createSolanaRpcMock,
}));

vi.mock("../errors", () => ({
  ValidatorStakingError: ValidatorStakingErrorMock,
}));

const ValidatorStakingError = ValidatorStakingErrorMock;
import { createRpcConnection, getRpcEndpoint } from "./rpc";

describe("Solana RPC helpers", () => {
  beforeEach(() => {
    createSolanaRpcMock.mockClear();
  });

  it("resolves configured endpoints by network", () => {
    vi.stubEnv("DEVNET_RPC_ENDPOINT", "https://devnet.example");
    vi.stubEnv("MAINNET_RPC_ENDPOINT", "https://mainnet.example");
    vi.stubEnv("TESTNET_RPC_ENDPOINT", "https://testnet.example");

    expect(getRpcEndpoint("devnet")).toBe("https://devnet.example");
    expect(getRpcEndpoint("mainnet")).toBe("https://mainnet.example");
    expect(getRpcEndpoint("testnet")).toBe("https://testnet.example");
  });

  it("defaults to devnet when network is null", () => {
    vi.stubEnv("DEVNET_RPC_ENDPOINT", "https://devnet.example");

    expect(getRpcEndpoint(null)).toBe("https://devnet.example");
  });

  it("throws a typed error for invalid networks", () => {
    expect(() => getRpcEndpoint("localnet")).toThrow(ValidatorStakingError);
  });

  it("creates an RPC connection from the endpoint", () => {
    vi.stubEnv("DEVNET_RPC_ENDPOINT", "https://devnet.example");

    expect(createRpcConnection("devnet")).toEqual({ endpoint: "https://devnet.example" });
    expect(createSolanaRpcMock).toHaveBeenCalledWith("https://devnet.example");
  });

  it("throws a typed error when the endpoint is missing", () => {
    expect(() => createRpcConnection("devnet")).toThrow("DEVNET_RPC_ENDPOINT environment variable not set");
  });
});
