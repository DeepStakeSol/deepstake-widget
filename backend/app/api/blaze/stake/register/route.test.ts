import { beforeEach, describe, expect, it, vi } from "vitest";
const { invalidateWalletDataMock, PublicKeyMock } = vi.hoisted(() => ({
  invalidateWalletDataMock: vi.fn(),
  PublicKeyMock: class {
    constructor(value: string) {
      if (value === "invalid") throw new Error("bad");
    }
  }
}));
vi.mock("@solana/web3.js", () => ({ PublicKey: PublicKeyMock }));
vi.mock("@/utils/walletData/service", () => ({
  invalidateWalletData: invalidateWalletDataMock
}));
import { POST } from "./route";
const request = (body: unknown) =>
  new Request("http://localhost/api/blaze/stake/register?network=mainnet", {
    method: "POST",
    body: JSON.stringify(body)
  });
describe("POST /api/blaze/stake/register", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    invalidateWalletDataMock.mockReset().mockResolvedValue(true);
  });
  it("proxies registration and invalidates applied stakes", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    const response = await POST(
      request({ validator: "vote", txid: "sig", wallet: "wallet" })
    );
    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith(
      "https://stake.solblaze.org/api/v1/cls_stake?validator=vote&txid=sig",
      { signal: expect.anything() }
    );
    expect(invalidateWalletDataMock).toHaveBeenCalledWith(
      "blaze-applied",
      "mainnet",
      "wallet"
    );
  });
  it("does not invalidate when registration fails", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 503 } as Response);
    expect(
      (
        await POST(
          request({ validator: "vote", txid: "sig", wallet: "wallet" })
        )
      ).status
    ).toBe(502);
    expect(invalidateWalletDataMock).not.toHaveBeenCalled();
  });
});
