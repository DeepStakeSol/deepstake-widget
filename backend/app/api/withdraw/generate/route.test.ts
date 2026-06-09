import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  compileTransactionMock,
  computeEstimateMock,
  createRpcConnectionMock,
  getBalanceMock,
  getBase64EncodedWireTransactionMock,
  getWithdrawInstructionMock,
  latestBlockhashSendMock,
} = vi.hoisted(() => {
  const latestBlockhashSendMock = vi.fn();
  return {
    compileTransactionMock: vi.fn(() => "compiled-withdraw-tx"),
    computeEstimateMock: vi.fn(),
    createRpcConnectionMock: vi.fn(() => ({
      getLatestBlockhash: vi.fn(() => ({ send: latestBlockhashSendMock })),
    })),
    getBalanceMock: vi.fn(),
    getBase64EncodedWireTransactionMock: vi.fn(() => "withdraw-wire-tx"),
    getWithdrawInstructionMock: vi.fn((input) => ({ type: "withdraw", input })),
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

vi.mock("@/utils/solana/stake/withdraw-instructions-v2", () => ({
  getWithdrawInstruction: getWithdrawInstructionMock,
}));

vi.mock("@/utils/solana/rpc", () => ({
  createRpcConnection: createRpcConnectionMock,
}));

vi.mock("@/utils/solana/balance", () => ({
  getBalance: getBalanceMock,
}));

import { POST } from "./route";

function request(body: unknown, url = "http://localhost/api/withdraw/generate?network=devnet") {
  return new Request(url, { method: "POST", body: JSON.stringify(body) });
}

describe("POST /api/withdraw/generate", () => {
  beforeEach(() => {
    computeEstimateMock.mockReset();
    latestBlockhashSendMock.mockReset();
    getBalanceMock.mockReset();
    compileTransactionMock.mockClear();
    getBase64EncodedWireTransactionMock.mockClear();
    getWithdrawInstructionMock.mockClear();
    getBalanceMock.mockResolvedValue(999);
    computeEstimateMock.mockResolvedValue(222);
    latestBlockhashSendMock.mockResolvedValue({
      value: { blockhash: "latest-blockhash", lastValidBlockHeight: BigInt(1) },
    });
  });

  it("requires stakeAccountAddress", async () => {
    const response = await POST(request({ recipientAccountAddress: "recipient" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Missing required parameter: stakeAccountAddress",
    });
  });

  it("requires recipientAccountAddress", async () => {
    const response = await POST(request({ stakeAccountAddress: "stake-account" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Missing required parameter: recipientAccountAddress",
    });
  });

  it("returns a generated wire transaction using the stake account balance", async () => {
    const response = await POST(
      request({ stakeAccountAddress: "stake-account", recipientAccountAddress: "recipient" })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ wireTransaction: "withdraw-wire-tx" });
    expect(createRpcConnectionMock).toHaveBeenCalledWith("devnet");
    expect(getBalanceMock).toHaveBeenCalledWith({
      rpc: expect.anything(),
      address: "stake-account",
    });
    expect(getWithdrawInstructionMock).toHaveBeenCalledWith(
      expect.objectContaining({ args: 999 }),
      expect.anything()
    );
    expect(computeEstimateMock).toHaveBeenCalled();
    expect(compileTransactionMock).toHaveBeenCalled();
  });
});
