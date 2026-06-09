import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  ConnectionMock,
  createAssociatedTokenAccountInstructionMock,
  getAccountMock,
  getPriorityFeeEstimateMock,
  getRpcEndpointMock,
  getStakePoolAccountMock,
  simulateTransactionMock,
  stakePoolInfoMock,
} = vi.hoisted(() => {
  const simulateTransactionMock = vi.fn();
  class ConnectionMock {
    getLatestBlockhash = vi.fn(() => Promise.resolve({ blockhash: "blockhash" }));
    simulateTransaction = simulateTransactionMock;
  }
  return {
    ConnectionMock,
    createAssociatedTokenAccountInstructionMock: vi.fn(() => ({ type: "create-ata" })),
    getAccountMock: vi.fn(),
    getPriorityFeeEstimateMock: vi.fn(),
    getRpcEndpointMock: vi.fn(() => "https://rpc.example"),
    getStakePoolAccountMock: vi.fn(),
    simulateTransactionMock,
    stakePoolInfoMock: vi.fn(),
  };
});

vi.mock("@solana/web3.js", () => ({
  ComputeBudgetProgram: {
    setComputeUnitLimit: vi.fn((input) => ({ type: "limit", input })),
    setComputeUnitPrice: vi.fn((input) => ({ type: "price", input })),
  },
  Connection: ConnectionMock,
  PublicKey: class PublicKey {
    constructor(public readonly value: string) {}
    toBuffer() {
      return Buffer.from(this.value);
    }
    static findProgramAddress = vi.fn(() => Promise.resolve(["withdraw-authority"]));
  },
  Transaction: class Transaction {
    recentBlockhash = "";
    feePayer: unknown;
    add = vi.fn();
    serialize() {
      return Buffer.from("blaze-transaction");
    }
  },
  TransactionInstruction: class TransactionInstruction {
    constructor(public readonly input: unknown) {}
  },
  TransactionMessage: class TransactionMessage {
    compileToV0Message() {
      return "compiled-message";
    }
  },
  VersionedTransaction: class VersionedTransaction {},
}));

vi.mock("@solana/spl-token", () => ({
  createAssociatedTokenAccountInstruction: createAssociatedTokenAccountInstructionMock,
  getAccount: getAccountMock,
  getAssociatedTokenAddressSync: vi.fn(() => "bsol-ata"),
}));

vi.mock("@solana/spl-stake-pool", () => ({
  getStakePoolAccount: getStakePoolAccountMock,
  STAKE_POOL_PROGRAM_ID: "stake-pool-program",
  StakePoolInstruction: {
    depositSol: vi.fn((input) => ({ type: "deposit-sol", input })),
  },
  stakePoolInfo: stakePoolInfoMock,
}));

vi.mock("@/utils/solana/rpc", () => ({
  getRpcEndpoint: getRpcEndpointMock,
}));

vi.mock("@/utils/priorityFee", () => ({
  getPriorityFeeEstimate: getPriorityFeeEstimateMock,
}));

vi.mock("@/utils/consts", () => ({
  BSOL_MINT: "bsol-mint",
  getBlazeStakePoolAddress: vi.fn(() => "stake-pool"),
  getBlazeUpdatePoolUrl: vi.fn(() => "https://update.example"),
}));

import { POST } from "./route";

function request(body: unknown, url = "http://localhost/api/blaze/stake/generate?network=devnet") {
  return {
    nextUrl: new URL(url),
    json: () => Promise.resolve(body),
  } as never;
}

describe("POST /api/blaze/stake/generate", () => {
  beforeEach(() => {
    getRpcEndpointMock.mockReset().mockReturnValue("https://rpc.example");
    stakePoolInfoMock.mockReset().mockResolvedValue({ details: { updateRequired: false } });
    getAccountMock.mockReset().mockResolvedValue({});
    getStakePoolAccountMock.mockReset().mockResolvedValue({
      account: { data: { reserveStake: "reserve", managerFeeAccount: "fee", poolMint: "pool-mint" } },
    });
    getPriorityFeeEstimateMock.mockReset().mockResolvedValue({ priorityFeeEstimate: 100 });
    simulateTransactionMock.mockReset().mockResolvedValue({ value: { unitsConsumed: 50_000 } });
    createAssociatedTokenAccountInstructionMock.mockClear();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("requires wallet and stakeLamports", async () => {
    const response = await POST(request({ wallet: "wallet" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "wallet and stakeLamports are required" });
  });

  it("requires a configured RPC endpoint", async () => {
    getRpcEndpointMock.mockReturnValue("");

    const response = await POST(request({ wallet: "wallet", stakeLamports: 100 }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "RPC endpoint not configured" });
  });

  it("returns a serialized transaction and creates ATA when missing", async () => {
    getAccountMock.mockRejectedValue(new Error("missing ata"));

    const response = await POST(request({ wallet: "wallet", stakeLamports: 100, voteIdentity: "vote" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      transaction: Buffer.from("blaze-transaction").toString("base64"),
    });
    expect(createAssociatedTokenAccountInstructionMock).toHaveBeenCalled();
  });

  it("calls the update endpoint when stake pool update is required", async () => {
    stakePoolInfoMock.mockResolvedValue({ details: { updateRequired: true } });

    await POST(request({ wallet: "wallet", stakeLamports: 100 }));

    expect(fetch).toHaveBeenCalledWith("https://update.example");
  });

  it("maps generic failures to 500", async () => {
    getStakePoolAccountMock.mockRejectedValue(new Error("pool failed"));

    const response = await POST(request({ wallet: "wallet", stakeLamports: 100 }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "pool failed" });
  });
});
