import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  ConnectionMock,
  getDirectInstructionMock,
  getPriorityFeeEstimateMock,
  getRpcEndpointMock,
  getStakeInstructionMock,
  simulateTransactionMock,
} = vi.hoisted(() => {
  const simulateTransactionMock = vi.fn();
  class ConnectionMock {
    getLatestBlockhash = vi.fn(() => Promise.resolve({ blockhash: "blockhash" }));
    simulateTransaction = simulateTransactionMock;
  }
  return {
    ConnectionMock,
    getDirectInstructionMock: vi.fn(),
    getPriorityFeeEstimateMock: vi.fn(),
    getRpcEndpointMock: vi.fn(() => "https://rpc.example"),
    getStakeInstructionMock: vi.fn(),
    simulateTransactionMock,
  };
});

vi.mock("@solana/web3.js", () => ({
  ComputeBudgetProgram: {
    setComputeUnitLimit: vi.fn((input) => ({ type: "limit", input })),
    setComputeUnitPrice: vi.fn((input) => ({ type: "price", input })),
  },
  Connection: ConnectionMock,
  PublicKey: class PublicKey {
    static default = "default-pubkey";
    constructor(public readonly value: string) {}
  },
  TransactionInstruction: class TransactionInstruction {},
  TransactionMessage: class TransactionMessage {
    compileToV0Message() {
      return "compiled-message";
    }
  },
  VersionedTransaction: class VersionedTransaction {
    serialize() {
      return Buffer.from("vault-transaction");
    }
  },
}));

vi.mock("@/utils/getDirectInstruction", () => ({
  getDirectInstruction: getDirectInstructionMock,
}));

vi.mock("@/utils/stakeInstruction", () => ({
  getStakeInstruction: getStakeInstructionMock,
}));

vi.mock("@/utils/priorityFee", () => ({
  getPriorityFeeEstimate: getPriorityFeeEstimateMock,
}));

vi.mock("@/utils/solana/rpc", () => ({
  getRpcEndpoint: getRpcEndpointMock,
}));

import { GET } from "./route";

function request(url: string) {
  return { nextUrl: new URL(url) } as unknown as NextRequest;
}

const baseUrl = "http://localhost/api/vstake?network=devnet&address=wallet&mint=mint&amount=1&balance=10";

describe("GET /api/vstake", () => {
  beforeEach(() => {
    getRpcEndpointMock.mockReset().mockReturnValue("https://rpc.example");
    getDirectInstructionMock.mockReset().mockResolvedValue([{ type: "direct" }]);
    getStakeInstructionMock.mockReset().mockResolvedValue([{ type: "stake" }]);
    getPriorityFeeEstimateMock.mockReset().mockResolvedValue({ priorityFeeEstimate: 100 });
    simulateTransactionMock.mockReset().mockResolvedValue({ value: { err: null, unitsConsumed: 50_000 } });
  });

  it("requires address, mint, amount, and balance", async () => {
    await expect((await GET(request("http://localhost/api/vstake?mint=mint&amount=1&balance=1"))).json()).resolves.toEqual({ error: "Missing required parameter: address" });
    await expect((await GET(request("http://localhost/api/vstake?address=wallet&amount=1&balance=1"))).json()).resolves.toEqual({ error: "Missing required parameter: mint" });
    await expect((await GET(request("http://localhost/api/vstake?address=wallet&mint=mint&balance=1"))).json()).resolves.toEqual({ error: "Missing required parameter: amount" });
    await expect((await GET(request("http://localhost/api/vstake?address=wallet&mint=mint&amount=1"))).json()).resolves.toEqual({ error: "Missing required parameter: balance" });
  });

  it("requires a configured RPC endpoint", async () => {
    getRpcEndpointMock.mockReturnValue("");

    const response = await GET(request(baseUrl));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "RPC endpoint not configured" });
  });

  it("rejects direct staking with non-vSOL mint", async () => {
    const response = await GET(request(baseUrl + "&target=validator"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Must use vSOL mint for direct staking" });
  });

  it("returns simulation failures as 400", async () => {
    simulateTransactionMock.mockResolvedValue({ value: { err: "sim-error" } });

    const response = await GET(request(baseUrl));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Vault transaction simulation failed",
      details: "sim-error",
    });
  });

  it("returns a serialized transaction", async () => {
    const response = await GET(request(baseUrl));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      transaction: Buffer.from("vault-transaction").toString("base64"),
    });
    expect(getStakeInstructionMock).toHaveBeenCalled();
    expect(getPriorityFeeEstimateMock).toHaveBeenCalled();
  });
});
