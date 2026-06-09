import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  compileTransactionMock,
  computeEstimateMock,
  createRpcConnectionMock,
  getBase64EncodedWireTransactionMock,
  getUnstakeInstructionMock,
  latestBlockhashSendMock,
} = vi.hoisted(() => {
  const latestBlockhashSendMock = vi.fn();
  return {
    compileTransactionMock: vi.fn(() => "compiled-unstake-tx"),
    computeEstimateMock: vi.fn(),
    createRpcConnectionMock: vi.fn(() => ({
      getLatestBlockhash: vi.fn(() => ({ send: latestBlockhashSendMock })),
    })),
    getBase64EncodedWireTransactionMock: vi.fn(() => "unstake-wire-tx"),
    getUnstakeInstructionMock: vi.fn((input) => ({ type: "unstake", input })),
    latestBlockhashSendMock,
  };
});

vi.mock("@solana/kit", () => ({
  address: vi.fn((value: string) => value),
  appendTransactionMessageInstruction: vi.fn((instruction, message) => ({
    ...message,
    instructions: [...(message.instructions ?? []), instruction],
  })),
  assertIsAddress: vi.fn(),
  assertIsTransactionMessageWithBlockhashLifetime: vi.fn(),
  compileTransaction: compileTransactionMock,
  createNoopSigner: vi.fn((value: string) => "signer:" + value),
  createTransactionMessage: vi.fn(() => ({ version: 0, instructions: [] })),
  getBase64EncodedWireTransaction: getBase64EncodedWireTransactionMock,
  getComputeUnitEstimateForTransactionMessageFactory: vi.fn(() => computeEstimateMock),
  pipe: vi.fn((value, ...fns) => fns.reduce((current, fn) => fn(current), value)),
  prependTransactionMessageInstruction: vi.fn((instruction, message) => ({
    ...message,
    instructions: [instruction, ...(message.instructions ?? [])],
  })),
  setTransactionMessageFeePayer: vi.fn((feePayer, message) => ({ ...message, feePayer })),
  setTransactionMessageLifetimeUsingBlockhash: vi.fn((blockhash, message) => ({
    ...message,
    blockhash,
  })),
}));

vi.mock("@solana-program/compute-budget", () => ({
  getSetComputeUnitLimitInstruction: vi.fn((input) => ({ type: "compute-limit", input })),
  getSetComputeUnitPriceInstruction: vi.fn((input) => ({ type: "compute-price", input })),
}));

vi.mock("@/utils/solana/stake/unstake-instructions", () => ({
  getUnstakeInstruction: getUnstakeInstructionMock,
}));

vi.mock("@/utils/solana/rpc", () => ({
  createRpcConnection: createRpcConnectionMock,
}));

import { POST } from "./route";

function request(body: unknown, url = "http://localhost/api/unstake/generate?network=devnet") {
  return new Request(url, { method: "POST", body: JSON.stringify(body) });
}

describe("POST /api/unstake/generate", () => {
  beforeEach(() => {
    computeEstimateMock.mockReset();
    latestBlockhashSendMock.mockReset();
    compileTransactionMock.mockClear();
    getBase64EncodedWireTransactionMock.mockClear();
    getUnstakeInstructionMock.mockClear();
    computeEstimateMock.mockResolvedValue(111);
    latestBlockhashSendMock.mockResolvedValue({
      value: { blockhash: "latest-blockhash", lastValidBlockHeight: BigInt(1) },
    });
  });

  it("requires stakerAddress", async () => {
    const response = await POST(request({ stakeAccountAddress: "stake-account" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Missing required parameter: stakerAddress" });
  });

  it("requires stakeAccountAddress", async () => {
    const response = await POST(request({ stakerAddress: "staker" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Missing required parameter: stakeAccountAddress",
    });
  });

  it("returns a generated wire transaction", async () => {
    const response = await POST(
      request({ stakerAddress: "staker", stakeAccountAddress: "stake-account" })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ wireTransaction: "unstake-wire-tx" });
    expect(createRpcConnectionMock).toHaveBeenCalledWith("devnet");
    expect(computeEstimateMock).toHaveBeenCalled();
    expect(getUnstakeInstructionMock).toHaveBeenCalled();
    expect(compileTransactionMock).toHaveBeenCalled();
  });
});
