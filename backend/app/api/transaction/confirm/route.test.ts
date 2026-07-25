import { beforeEach, describe, expect, it, vi } from "vitest";

const { confirmTransactionMock, invalidateMutationDataMock, PublicKeyMock } =
  vi.hoisted(() => ({
    confirmTransactionMock: vi.fn(),
    invalidateMutationDataMock: vi.fn(),
    PublicKeyMock: class {
      constructor(value: string) {
        if (value === "invalid") throw new Error("bad key");
      }
    }
  }));
vi.mock("@solana/web3.js", () => ({ PublicKey: PublicKeyMock }));
vi.mock("@/utils/solana/status", () => ({
  confirmTransaction: confirmTransactionMock
}));
vi.mock("@/utils/walletData/mutations", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/utils/walletData/mutations")>();
  return { ...actual, invalidateMutationData: invalidateMutationDataMock };
});

import { POST } from "./route";
const request = (body: unknown) =>
  new Request("http://localhost/api/transaction/confirm?network=devnet", {
    method: "POST",
    body: JSON.stringify(body)
  });

describe("POST /api/transaction/confirm", () => {
  beforeEach(() => {
    confirmTransactionMock.mockReset();
    invalidateMutationDataMock.mockReset().mockResolvedValue(true);
  });

  it("requires a txid", async () => {
    const response = await POST(request({}));
    expect(response.status).toBe(400);
  });

  it("preserves generic confirmation options", async () => {
    confirmTransactionMock.mockResolvedValue(undefined);
    const response = await POST(
      request({
        txid: "sig",
        targetCommitment: "processed",
        timeout: 10,
        interval: 2
      })
    );
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(confirmTransactionMock).toHaveBeenCalledWith({
      network: "devnet",
      txid: "sig",
      targetCommitment: "processed",
      timeout: 10,
      interval: 2
    });
    expect(invalidateMutationDataMock).not.toHaveBeenCalled();
  });

  it("uses confirmed commitment and invalidates typed mutation data", async () => {
    confirmTransactionMock.mockResolvedValue(undefined);
    const cacheMutation = {
      walletAddress: "wallet",
      mutation: "native-unstake"
    } as const;
    const response = await POST(
      request({ txid: "sig", targetCommitment: "processed", cacheMutation })
    );
    expect(response.status).toBe(200);
    expect(confirmTransactionMock).toHaveBeenCalledWith(
      expect.objectContaining({ targetCommitment: "confirmed" })
    );
    expect(invalidateMutationDataMock).toHaveBeenCalledWith(
      "devnet",
      cacheMutation
    );
  });

  it("rejects invalid mutation contexts", async () => {
    const response = await POST(
      request({
        txid: "sig",
        cacheMutation: { walletAddress: "invalid", mutation: "other" }
      })
    );
    expect(response.status).toBe(400);
    expect(confirmTransactionMock).not.toHaveBeenCalled();
  });

  it("returns 500 when confirmation fails", async () => {
    confirmTransactionMock.mockRejectedValue(new Error("timeout"));
    expect((await POST(request({ txid: "sig" }))).status).toBe(500);
  });
});
