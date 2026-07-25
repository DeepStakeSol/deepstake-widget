import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/utils/errors", () => ({
  ValidatorStakingError: class ValidatorStakingError extends Error {}
}));

const { getNativeStakeAccountsMock, getStakeAccountsMock } = vi.hoisted(() => ({
  getNativeStakeAccountsMock: vi.fn(),
  getStakeAccountsMock: vi.fn()
}));
vi.mock("@/utils/walletData/providers", () => ({
  getNativeStakeAccounts: getNativeStakeAccountsMock
}));
vi.mock("@/utils/solana/rpc", () => ({
  createRpcConnection: vi.fn(() => ({ rpc: true }))
}));
vi.mock("@/utils/solana/stake/get-stake-accounts", () => ({
  getStakeAccounts: getStakeAccountsMock
}));
vi.mock("@solana/kit", () => ({ address: vi.fn((value: string) => value) }));

import { GET } from "./route";
const request = (url: string) =>
  ({ nextUrl: new URL(url) }) as unknown as NextRequest;

describe("GET /api/stake/fetch", () => {
  beforeEach(() => {
    getNativeStakeAccountsMock.mockReset();
    getStakeAccountsMock.mockReset();
  });

  it("requires an owner address", async () => {
    const response = await GET(
      request("http://localhost/api/stake/fetch?network=devnet")
    );
    expect(response.status).toBe(400);
  });

  it("uses the wallet cache and supports forced refresh", async () => {
    getNativeStakeAccountsMock.mockResolvedValue([{ address: "stake" }]);
    const response = await GET(
      request(
        "http://localhost/api/stake/fetch?network=mainnet&owner=owner&refresh=true"
      )
    );
    await expect(response.json()).resolves.toEqual({
      stakeAccounts: [{ address: "stake" }]
    });
    expect(getNativeStakeAccountsMock).toHaveBeenCalledWith(
      "mainnet",
      "owner",
      true
    );
  });

  it("keeps vote-filtered reads uncached", async () => {
    getStakeAccountsMock.mockResolvedValue([]);
    await GET(
      request(
        "http://localhost/api/stake/fetch?network=mainnet&owner=owner&vote=vote&refresh=true"
      )
    );
    expect(getNativeStakeAccountsMock).not.toHaveBeenCalled();
    expect(getStakeAccountsMock).toHaveBeenCalledWith({
      rpc: { rpc: true },
      owner: "owner",
      vote: "vote"
    });
  });

  it("maps provider failures to 500", async () => {
    getNativeStakeAccountsMock.mockRejectedValue(new Error("boom"));
    const response = await GET(
      request("http://localhost/api/stake/fetch?owner=owner")
    );
    expect(response.status).toBe(500);
  });
});
