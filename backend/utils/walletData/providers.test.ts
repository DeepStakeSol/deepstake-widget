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

  it("uses stakebot data as the source of truth even below 1 vSOL", async () => {
    mocks.getTokenAccountBalanceSend.mockResolvedValue({
      value: { amount: "80000000" }
    });
    await expect(fetchVaultManage("mainnet", WALLET)).resolves.toEqual({
      wallet: WALLET,
      binding: { hasBinding: true, validatorVoteKey: "validator" },
      balance: { vsol: "80000000" },
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

  it("reports updating when the stakebot has no data but the balance is eligible", async () => {
    mocks.getStakebotStake.mockResolvedValue({ found: false, epoch: 100 });
    const result = await fetchVaultManage("mainnet", WALLET);
    expect(result.uiStatus).toBe("updating");
  });

  it("reports low balance only when the stakebot has no data", async () => {
    mocks.getStakebotStake.mockResolvedValue({ found: false, epoch: 100 });
    mocks.getTokenAccountBalanceSend.mockResolvedValue({
      value: { amount: "80000000" }
    });
    const result = await fetchVaultManage("mainnet", WALLET);
    expect(result.uiStatus).toBe("low_balance");
  });

  it("stays ready when token balance lookup fails but stakebot data exists", async () => {
    mocks.getTokenAccountBalanceSend.mockRejectedValue(new Error("missing"));
    const result = await fetchVaultManage("mainnet", WALLET);
    expect(result.balance).toEqual({ vsol: "0" });
    expect(result.uiStatus).toBe("ready");
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
