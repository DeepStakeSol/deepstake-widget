import { beforeEach, describe, expect, it, vi } from "vitest";

const { confirmTransactionMock } = vi.hoisted(() => ({
  confirmTransactionMock: vi.fn(),
}));

vi.mock("@/utils/solana/status", () => ({
  confirmTransaction: confirmTransactionMock,
}));

import { POST } from "./route";

function request(body: unknown, url = "http://localhost/api/transaction/confirm?network=devnet") {
  return new Request(url, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/transaction/confirm", () => {
  beforeEach(() => {
    confirmTransactionMock.mockReset();
  });

  it("requires a txid", async () => {
    const response = await POST(request({}));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Missing required parameter: txid" });
  });

  it("confirms a transaction", async () => {
    confirmTransactionMock.mockResolvedValue(undefined);

    const response = await POST(
      request({ txid: "sig", targetCommitment: "processed", timeout: 10, interval: 2 })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(confirmTransactionMock).toHaveBeenCalledWith({
      network: "devnet",
      txid: "sig",
      targetCommitment: "processed",
      timeout: 10,
      interval: 2,
    });
  });

  it("returns 500 when confirmation fails", async () => {
    confirmTransactionMock.mockRejectedValue(new Error("timeout"));

    const response = await POST(request({ txid: "sig" }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Failed to confirm transaction" });
  });
});
