import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const { getBlazeAppliedStakesMock, PublicKeyMock } = vi.hoisted(() => ({
  getBlazeAppliedStakesMock: vi.fn(),
  PublicKeyMock: class {
    constructor(value: string) {
      if (value === "invalid") throw new Error("bad");
    }
  }
}));
vi.mock("@solana/web3.js", () => ({ PublicKey: PublicKeyMock }));
vi.mock("@/utils/walletData/providers", () => ({
  getBlazeAppliedStakes: getBlazeAppliedStakesMock
}));
import { GET } from "./route";
const request = (url: string) =>
  ({ nextUrl: new URL(url) }) as unknown as NextRequest;
describe("GET /api/blaze/manage/applied-stakes", () => {
  beforeEach(() => getBlazeAppliedStakesMock.mockReset());
  it("validates the wallet", async () => {
    expect(
      (await GET(request("http://localhost/api/blaze/manage/applied-stakes")))
        .status
    ).toBe(400);
    expect(
      (
        await GET(
          request(
            "http://localhost/api/blaze/manage/applied-stakes?wallet=invalid"
          )
        )
      ).status
    ).toBe(400);
  });
  it("returns cached applied stakes and forwards refresh", async () => {
    getBlazeAppliedStakesMock.mockResolvedValue([
      { voteAcc: "vote", amount: 1 }
    ]);
    const response = await GET(
      request(
        "http://localhost/api/blaze/manage/applied-stakes?wallet=wallet&network=mainnet&refresh=true"
      )
    );
    await expect(response.json()).resolves.toEqual({
      appliedStakes: [{ voteAcc: "vote", amount: 1 }]
    });
    expect(getBlazeAppliedStakesMock).toHaveBeenCalledWith(
      "mainnet",
      "wallet",
      true
    );
  });
});
