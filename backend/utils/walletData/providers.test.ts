import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createRpcConnection: vi.fn(),
  findAssociatedTokenPda: vi.fn(() => Promise.resolve(["vsol-ata", 255])),
  getStakebotStake: vi.fn(),
  getTokenAccountBalanceSend: vi.fn(),
  getVaultBinding: vi.fn()
}));

vi.mock("@solana-program/token", () => ({
  TOKEN_PROGRAM_ADDRESS: "token-program",
  findAssociatedTokenPda: mocks.findAssociatedTokenPda
}));
vi.mock("../solana/rpc", () => ({
  createRpcConnection: mocks.createRpcConnection
}));
vi.mock("../stakebot", () => ({ getStakebotStake: mocks.getStakebotStake }));
vi.mock("../vaultBinding", () => ({ getVaultBinding: mocks.getVaultBinding }));

import { fetchVaultManage } from "./providers";

const WALLET = "11111111111111111111111111111111";

describe("fetchVaultManage", () => {
  beforeEach(() => {
    mocks.createRpcConnection.mockReset().mockReturnValue({
      getTokenAccountBalance: vi.fn(() => ({
        send: mocks.getTokenAccountBalanceSend
      }))
    });
    mocks.getVaultBinding.mockReset().mockResolvedValue({
      hasBinding: true,
      stakeTarget: "validator"
    });
    mocks.getStakebotStake.mockReset().mockResolvedValue({
      found: true,
      generatedStake: "2.5",
      epoch: 100,
      sourceFile: "stats.json",
      sourceUrl: "https://example/stats.json"
    });
    mocks.getTokenAccountBalanceSend.mockReset().mockResolvedValue({
      value: { amount: "2000000000" }
    });
  });

  it("preserves the ready Vault management response", async () => {
    await expect(fetchVaultManage("mainnet", WALLET)).resolves.toEqual({
      wallet: WALLET,
      binding: { hasBinding: true, validatorVoteKey: "validator" },
      balance: { vsol: "2000000000" },
      stakebot: {
        found: true,
        generatedStake: "2.5",
        epoch: 100,
        sourceFile: "stats.json",
        sourceUrl: "https://example/stats.json"
      },
      uiStatus: "ready"
    });
    expect(mocks.createRpcConnection).toHaveBeenCalledWith("mainnet");
    expect(mocks.findAssociatedTokenPda).toHaveBeenCalledWith(
      expect.objectContaining({ owner: WALLET, tokenProgram: "token-program" })
    );
  });

  it("falls back to zero balance and no-binding status", async () => {
    mocks.getVaultBinding.mockResolvedValue({ hasBinding: false });
    mocks.getTokenAccountBalanceSend.mockRejectedValue(new Error("missing"));
    const result = await fetchVaultManage("devnet", WALLET);
    expect(result.balance).toEqual({ vsol: "0" });
    expect(result.binding).toEqual({
      hasBinding: false,
      validatorVoteKey: undefined
    });
    expect(result.uiStatus).toBe("no_binding");
  });
});
