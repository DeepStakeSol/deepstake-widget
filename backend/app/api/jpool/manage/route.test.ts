import { beforeEach, describe, expect, it, vi } from "vitest";

const { getJpoolManageMock } = vi.hoisted(() => ({
  getJpoolManageMock: vi.fn()
}));
vi.mock("@/utils/walletData/providers", () => ({
  getJpoolManage: getJpoolManageMock
}));

import { GET } from "./route";

const WALLET = "4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T";
const VOTE = "DeEpSdaw8uBLQ5T2HQhDf8fBSVbm13jGqJwoSF3HTpL5";

function request(params: Record<string, string>) {
  const url = new URL("http://localhost/api/jpool/manage");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return { nextUrl: url } as never;
}

async function get(params: Record<string, string>) {
  const response = await GET(request(params));
  return { status: response.status, body: await response.json() };
}

describe("GET /api/jpool/manage", () => {
  beforeEach(() => {
    getJpoolManageMock.mockReset().mockResolvedValue({ uiStatus: "not_bound" });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("returns the provider result, defaulting to mainnet", async () => {
    await expect(get({ wallet: WALLET, vote: VOTE })).resolves.toEqual({
      status: 200,
      body: { uiStatus: "not_bound" }
    });
    expect(getJpoolManageMock).toHaveBeenCalledWith("mainnet", WALLET, VOTE, false);
  });

  it("passes refresh=true through", async () => {
    await get({ wallet: WALLET, vote: VOTE, network: "mainnet", refresh: "true" });
    expect(getJpoolManageMock).toHaveBeenCalledWith("mainnet", WALLET, VOTE, true);
  });

  it.each([
    [{ wallet: WALLET, vote: VOTE, network: "devnet" }, "JPOOL_MAINNET_ONLY"],
    [{ wallet: WALLET, vote: VOTE, network: "other" }, "JPOOL_MAINNET_ONLY"],
    [{ vote: VOTE }, "INVALID_WALLET"],
    [{ wallet: "not-a-key", vote: VOTE }, "INVALID_WALLET"],
    [{ wallet: WALLET }, "INVALID_VOTE_ACCOUNT"],
    [{ wallet: WALLET, vote: "not-a-key" }, "INVALID_VOTE_ACCOUNT"]
  ])("rejects %j with %s", async (params, code) => {
    const result = await get(params);
    expect(result.status).toBe(400);
    expect(result.body.code).toBe(code);
    expect(getJpoolManageMock).not.toHaveBeenCalled();
  });

  it("returns 500 with a manage-specific code on unexpected failures", async () => {
    getJpoolManageMock.mockRejectedValue(new Error("boom"));
    await expect(get({ wallet: WALLET, vote: VOTE })).resolves.toEqual({
      status: 500,
      body: { error: "Failed to load JPool data", code: "JPOOL_MANAGE_FAILED" }
    });
  });
});
