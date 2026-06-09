import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  ConnectionMock,
  appendTransactionMessageInstructionMock,
  compileTransactionMock,
  computeEstimateMock,
  createRpcConnectionMock,
  getAccountInfoMock,
  getBase64EncodedWireTransactionMock,
  getMinimumBalanceForRentExemptionMock,
  getRpcEndpointMock,
  getStakeMinimumDelegationMock,
  latestBlockhashSendMock,
} = vi.hoisted(() => {
  const getAccountInfoMock = vi.fn();
  const getMinimumBalanceForRentExemptionMock = vi.fn();
  const getStakeMinimumDelegationMock = vi.fn();

  class ConnectionMock {
    getAccountInfo = getAccountInfoMock;
    getMinimumBalanceForRentExemption = getMinimumBalanceForRentExemptionMock;
    getStakeMinimumDelegation = getStakeMinimumDelegationMock;
  }

  const latestBlockhashSendMock = vi.fn();

  return {
    ConnectionMock,
    appendTransactionMessageInstructionMock: vi.fn((instruction, message) => ({
      ...message,
      instructions: [...(message.instructions ?? []), instruction],
    })),
    compileTransactionMock: vi.fn(() => "compiled-tx"),
    computeEstimateMock: vi.fn(),
    createRpcConnectionMock: vi.fn(() => ({
      getLatestBlockhash: vi.fn(() => ({ send: latestBlockhashSendMock })),
    })),
    getAccountInfoMock,
    getBase64EncodedWireTransactionMock: vi.fn(() => "wire-tx"),
    getMinimumBalanceForRentExemptionMock,
    getRpcEndpointMock: vi.fn(() => "https://rpc.example"),
    getStakeMinimumDelegationMock,
    latestBlockhashSendMock,
  };
});

vi.mock("@solana/web3.js", () => ({
  Connection: ConnectionMock,
  PublicKey: class PublicKey {
    constructor(public readonly value: string) {}
    toBase58() {
      return this.value;
    }
  },
  VoteProgram: { programId: { toBase58: () => "vote-program" } },
}));

vi.mock("@solana/kit", () => ({
  address: vi.fn((value: string) => value),
  appendTransactionMessageInstruction: appendTransactionMessageInstructionMock,
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

vi.mock("@solana-program/system", () => ({
  getCreateAccountInstruction: vi.fn((input) => ({ type: "create-account", input })),
}));

vi.mock("@/utils/solana/stake/stake-instructions", () => ({
  getDelegateStakeInstruction: vi.fn((input) => ({ type: "delegate", input })),
  getInitializeInstruction: vi.fn((input) => ({ type: "initialize", input })),
}));

vi.mock("@/utils/solana/rpc", () => ({
  createRpcConnection: createRpcConnectionMock,
  getRpcEndpoint: getRpcEndpointMock,
}));

import { POST } from "./route";

function request(body: unknown, url = "http://localhost/api/stake/generate?network=devnet") {
  return new Request(url, { method: "POST", body: JSON.stringify(body) });
}

const validBody = {
  stakeLamports: 10_000,
  stakerAddress: "staker-address",
  newAccountAddress: "new-account-address",
  voteAccount: "vote-address",
};

describe("POST /api/stake/generate", () => {
  beforeEach(() => {
    getAccountInfoMock.mockReset();
    getMinimumBalanceForRentExemptionMock.mockReset();
    getStakeMinimumDelegationMock.mockReset();
    computeEstimateMock.mockReset();
    latestBlockhashSendMock.mockReset();
    compileTransactionMock.mockClear();
    getBase64EncodedWireTransactionMock.mockClear();

    getAccountInfoMock.mockResolvedValue({ owner: { equals: () => true, toBase58: () => "vote-program" } });
    getMinimumBalanceForRentExemptionMock.mockResolvedValue(2_000);
    getStakeMinimumDelegationMock.mockResolvedValue({ value: 3_000 });
    computeEstimateMock.mockResolvedValue(12_345);
    latestBlockhashSendMock.mockResolvedValue({
      value: { blockhash: "latest-blockhash", lastValidBlockHeight: BigInt(1) },
    });
  });

  it("requires stakeLamports", async () => {
    const response = await POST(request({ ...validBody, stakeLamports: undefined }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Missing required parameter: stakeLamports" });
  });

  it("requires stakerAddress", async () => {
    const response = await POST(request({ ...validBody, stakerAddress: undefined }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Missing required parameter: stakerAddress" });
  });

  it("requires newAccountAddress", async () => {
    const response = await POST(request({ ...validBody, newAccountAddress: undefined }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Missing required parameter: newAccountAddress" });
  });

  it("requires voteAccount", async () => {
    const response = await POST(request({ ...validBody, voteAccount: undefined }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Missing required parameter: voteAccount" });
  });

  it("rejects missing vote accounts", async () => {
    getAccountInfoMock.mockResolvedValue(null);

    const response = await POST(request(validBody));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Vote account not found on selected network",
      details: { network: "devnet", voteAccount: "vote-address" },
    });
  });

  it("rejects non-vote account owners", async () => {
    getAccountInfoMock.mockResolvedValue({
      owner: { equals: () => false, toBase58: () => "system-program" },
    });

    const response = await POST(request(validBody));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Configured vote account is not a Solana vote account on selected network",
      details: { owner: "system-program", expectedOwner: "vote-program" },
    });
  });

  it("rejects below-minimum stake amounts", async () => {
    const response = await POST(request({ ...validBody, stakeLamports: 4_999 }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Stake amount is below the selected network minimum",
      details: { minimumStakeLamports: 5_000 },
    });
  });

  it("returns simulation errors as 400", async () => {
    computeEstimateMock.mockRejectedValue(new Error("simulation failed"));

    const response = await POST(request(validBody));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Stake transaction simulation failed",
    });
  });

  it("returns a generated wire transaction", async () => {
    const response = await POST(request(validBody));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ wireTransaction: "wire-tx" });
    expect(createRpcConnectionMock).toHaveBeenCalledWith("devnet");
    expect(computeEstimateMock).toHaveBeenCalled();
    expect(compileTransactionMock).toHaveBeenCalled();
    expect(getBase64EncodedWireTransactionMock).toHaveBeenCalledWith("compiled-tx");
  });
});
