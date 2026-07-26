import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  ataAccountSendMock,
  compileTransactionMock,
  computeEstimateMock,
  createAssociatedTokenAccountInstructionMock,
  createRpcConnectionMock,
  decodeStakePoolMock,
  depositSolInstructionMock,
  epochInfoSendMock,
  findAssociatedTokenPdaMock,
  getPriorityFeeEstimateMock,
  getRpcEndpointMock,
  latestBlockhashSendMock,
  memoInstructionMock,
  stakePoolAccountSendMock
} = vi.hoisted(() => {
  const stakePoolAccountSendMock = vi.fn();
  const ataAccountSendMock = vi.fn();
  const epochInfoSendMock = vi.fn();
  const latestBlockhashSendMock = vi.fn();
  return {
    ataAccountSendMock,
    compileTransactionMock: vi.fn(() => "compiled-transaction"),
    computeEstimateMock: vi.fn(),
    createAssociatedTokenAccountInstructionMock: vi.fn(() => ({
      type: "create-ata"
    })),
    createRpcConnectionMock: vi.fn(() => ({
      getAccountInfo: vi.fn((account: string) => ({
        send:
          account === "bsol-ata" ? ataAccountSendMock : stakePoolAccountSendMock
      })),
      getEpochInfo: vi.fn(() => ({ send: epochInfoSendMock })),
      getLatestBlockhash: vi.fn(() => ({ send: latestBlockhashSendMock }))
    })),
    decodeStakePoolMock: vi.fn(),
    depositSolInstructionMock: vi.fn(() => ({ type: "deposit-sol" })),
    epochInfoSendMock,
    findAssociatedTokenPdaMock: vi.fn(() => Promise.resolve(["bsol-ata", 255])),
    getPriorityFeeEstimateMock: vi.fn(),
    getRpcEndpointMock: vi.fn(() => "https://rpc.example"),
    latestBlockhashSendMock,
    memoInstructionMock: vi.fn(() => ({ type: "memo" })),
    stakePoolAccountSendMock
  };
});

vi.mock("@solana/kit", () => ({
  address: vi.fn((value: string) => value),
  appendTransactionMessageInstructions: vi.fn((instructions, message) => ({
    ...message,
    instructions: [...(message.instructions ?? []), ...instructions]
  })),
  assertIsAddress: vi.fn(),
  assertIsTransactionMessageWithBlockhashLifetime: vi.fn(),
  compileTransaction: compileTransactionMock,
  createNoopSigner: vi.fn((value: string) => ({ address: value })),
  createTransactionMessage: vi.fn(() => ({
    version: "legacy",
    instructions: []
  })),
  getBase64EncodedWireTransaction: vi.fn(() => "blaze-transaction-base64"),
  getBase64Encoder: vi.fn(() => ({ encode: vi.fn(() => new Uint8Array([1])) })),
  getComputeUnitEstimateForTransactionMessageFactory: vi.fn(
    () => computeEstimateMock
  ),
  pipe: vi.fn((value, ...fns) =>
    fns.reduce((current, fn) => fn(current), value)
  ),
  prependTransactionMessageInstruction: vi.fn((instruction, message) => ({
    ...message,
    instructions: [instruction, ...(message.instructions ?? [])]
  })),
  setTransactionMessageFeePayer: vi.fn((feePayer, message) => ({
    ...message,
    feePayer
  })),
  setTransactionMessageLifetimeUsingBlockhash: vi.fn((blockhash, message) => ({
    ...message,
    blockhash
  }))
}));

vi.mock("@solana-program/token", () => ({
  findAssociatedTokenPda: findAssociatedTokenPdaMock,
  TOKEN_PROGRAM_ADDRESS: "token-program"
}));

vi.mock("@solana-program/compute-budget", () => ({
  getSetComputeUnitLimitInstruction: vi.fn((input) => ({
    type: "limit",
    input
  })),
  getSetComputeUnitPriceInstruction: vi.fn((input) => ({
    type: "price",
    input
  }))
}));

vi.mock("@/utils/solana/blaze/stake-pool", () => ({
  decodeBlazeStakePoolAccount: decodeStakePoolMock,
  findStakePoolWithdrawAuthority: vi.fn(() =>
    Promise.resolve("withdraw-authority")
  ),
  getBlazeMemoInstruction: memoInstructionMock,
  getCreateAssociatedTokenAccountInstruction:
    createAssociatedTokenAccountInstructionMock,
  getDepositSolInstruction: depositSolInstructionMock,
  STAKE_POOL_PROGRAM_ADDRESS: "stake-pool-program"
}));

vi.mock("@/utils/solana/rpc", () => ({
  createRpcConnection: createRpcConnectionMock,
  getRpcEndpoint: getRpcEndpointMock
}));

vi.mock("@/utils/priorityFee", () => ({
  getPriorityFeeEstimate: getPriorityFeeEstimateMock
}));

vi.mock("@/utils/consts", () => ({
  BSOL_MINT: "bsol-mint",
  getBlazeStakePoolAddress: vi.fn(() => "stake-pool"),
  getBlazeUpdatePoolUrl: vi.fn(() => "https://update.example")
}));

import { POST } from "./route";

function request(
  body: unknown,
  url = "http://localhost/api/blaze/stake/generate?network=devnet"
) {
  return { nextUrl: new URL(url), json: () => Promise.resolve(body) } as never;
}

describe("POST /api/blaze/stake/generate", () => {
  beforeEach(() => {
    getRpcEndpointMock.mockReset().mockReturnValue("https://rpc.example");
    createRpcConnectionMock.mockClear();
    stakePoolAccountSendMock.mockReset().mockResolvedValue({
      value: { owner: "stake-pool-program", data: ["encoded-pool", "base64"] }
    });
    ataAccountSendMock.mockReset().mockResolvedValue({ value: {} });
    epochInfoSendMock.mockReset().mockResolvedValue({ epoch: BigInt(10) });
    latestBlockhashSendMock.mockReset().mockResolvedValue({
      value: { blockhash: "latest-blockhash", lastValidBlockHeight: BigInt(1) }
    });
    decodeStakePoolMock.mockReset().mockReturnValue({
      reserveStake: "reserve",
      managerFeeAccount: "fee",
      poolMint: "pool-mint",
      tokenProgram: "token-program",
      lastUpdateEpoch: BigInt(10)
    });
    getPriorityFeeEstimateMock
      .mockReset()
      .mockResolvedValue({ priorityFeeEstimate: 100 });
    computeEstimateMock.mockReset().mockResolvedValue(50_000);
    compileTransactionMock.mockClear();
    createAssociatedTokenAccountInstructionMock.mockClear();
    depositSolInstructionMock.mockClear();
    memoInstructionMock.mockClear();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("requires wallet and stakeLamports", async () => {
    const response = await POST(request({ wallet: "wallet" }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "wallet and stakeLamports are required"
    });
  });

  it("requires a configured RPC endpoint", async () => {
    getRpcEndpointMock.mockReturnValue("");
    const response = await POST(
      request({ wallet: "wallet", stakeLamports: 100 })
    );
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "RPC endpoint not configured"
    });
  });

  it("returns a legacy transaction and creates the ATA when missing", async () => {
    ataAccountSendMock.mockResolvedValue({ value: null });
    const response = await POST(
      request({ wallet: "wallet", stakeLamports: 100, voteIdentity: "vote" })
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      transaction: "blaze-transaction-base64"
    });
    expect(createRpcConnectionMock).toHaveBeenCalledWith("devnet");
    expect(createAssociatedTokenAccountInstructionMock).toHaveBeenCalled();
    expect(depositSolInstructionMock).toHaveBeenCalledWith(
      expect.objectContaining({ lamports: BigInt(100) })
    );
    expect(memoInstructionMock).toHaveBeenCalled();
    expect(computeEstimateMock).toHaveBeenCalled();
  });

  it("calls the update endpoint when the stake pool epoch is stale", async () => {
    decodeStakePoolMock.mockReturnValue({
      reserveStake: "reserve",
      managerFeeAccount: "fee",
      poolMint: "pool-mint",
      tokenProgram: "token-program",
      lastUpdateEpoch: BigInt(9)
    });
    await POST(request({ wallet: "wallet", stakeLamports: 100 }));
    expect(fetch).toHaveBeenCalledWith("https://update.example");
  });

  it("rejects accounts not owned by the Stake Pool program", async () => {
    stakePoolAccountSendMock.mockResolvedValue({
      value: { owner: "wrong-program", data: ["encoded-pool", "base64"] }
    });
    const response = await POST(
      request({ wallet: "wallet", stakeLamports: 100 })
    );
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid stake pool account owner"
    });
  });

  it("maps generic failures to 500", async () => {
    stakePoolAccountSendMock.mockRejectedValue(new Error("pool failed"));
    const response = await POST(
      request({ wallet: "wallet", stakeLamports: 100 })
    );
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "pool failed" });
  });
});
