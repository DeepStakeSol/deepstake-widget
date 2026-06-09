import { vi } from "vitest";

import { describe, expect, it } from "vitest";

import {
  getCurrentChain,
  getExplorerAccountUrl,
  getExplorerTxUrl,
  getNetworkIdentifier,
  getValidatorAddress,
} from "./config";

describe("backend config helpers", () => {
  it("defaults to devnet", () => {
    expect(getNetworkIdentifier()).toBe("devnet");
    expect(getCurrentChain()).toBe("solana:devnet");
  });

  it("uses mainnet explorer URLs without devnet cluster query", () => {
    vi.stubEnv("NEXT_PUBLIC_NETWORK_ENV", "mainnet");

    expect(
      getExplorerTxUrl({ signature: "sig", explorer: "solana-explorer" })
    ).toBe("https://explorer.solana.com/tx/sig");
    expect(
      getExplorerAccountUrl({ account: "acct", explorer: "solscan" })
    ).toBe("https://solscan.io/account/acct");
  });

  it("adds devnet cluster query for devnet explorer URLs", () => {
    vi.stubEnv("NEXT_PUBLIC_NETWORK_ENV", "devnet");

    expect(getExplorerTxUrl({ signature: "sig", explorer: "solscan" })).toBe(
      "https://solscan.io/tx/sig?cluster=devnet"
    );
  });

  it("throws when the validator address is missing", () => {
    expect(() => getValidatorAddress()).toThrow("Validator ENV is not set");
  });

  it("throws for invalid configured networks", () => {
    vi.stubEnv("NEXT_PUBLIC_NETWORK_ENV", "localnet");

    expect(() => getNetworkIdentifier()).toThrow("Invalid network specified: localnet");
  });
});
