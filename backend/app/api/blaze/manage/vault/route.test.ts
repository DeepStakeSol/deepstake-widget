import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/utils/errors", () => ({
  ValidatorStakingError: class ValidatorStakingError extends Error {}
}));

const { getVaultManageMock, PublicKeyMock } = vi.hoisted(() => ({
  getVaultManageMock: vi.fn(),
  PublicKeyMock: class {
    constructor(value: string) {
      if (value === "invalid") throw new Error("bad key");
    }
  }
}));
vi.mock("@solana/web3.js", () => ({ PublicKey: PublicKeyMock }));
vi.mock("@/utils/walletData/providers", () => ({
  getVaultManage: getVaultManageMock
}));

import { GET } from "./route";
const request = (url: string) =>
  ({ nextUrl: new URL(url) }) as unknown as NextRequest;

describe("GET /api/blaze/manage/vault", () => {
  beforeEach(() => getVaultManageMock.mockReset());

  it("requires and validates wallet", async () => {
    expect(
      (await GET(request("http://localhost/api/blaze/manage/vault"))).status
    ).toBe(400);
    expect(
      (
        await GET(
          request("http://localhost/api/blaze/manage/vault?wallet=invalid")
        )
      ).status
    ).toBe(400);
  });

  it("uses the cache service and supports forced refresh", async () => {
    const data = { wallet: "wallet", uiStatus: "ready" };
    getVaultManageMock.mockResolvedValue(data);
    const response = await GET(
      request(
        "http://localhost/api/blaze/manage/vault?wallet=wallet&network=mainnet&refresh=true"
      )
    );
    await expect(response.json()).resolves.toEqual(data);
    expect(getVaultManageMock).toHaveBeenCalledWith("mainnet", "wallet", true);
  });
});
