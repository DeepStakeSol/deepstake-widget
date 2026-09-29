import { beforeEach, describe, expect, it, vi } from "vitest";

const { getJpoolEligibilityMock } = vi.hoisted(() => ({
  getJpoolEligibilityMock: vi.fn()
}));
vi.mock("@/utils/jpool/eligibility", () => ({
  getJpoolEligibility: getJpoolEligibilityMock
}));

import { GET } from "./route";

const VOTE = "DeEpSdaw8uBLQ5T2HQhDf8fBSVbm13jGqJwoSF3HTpL5";

function request(params: Record<string, string>) {
  const url = new URL("http://localhost/api/jpool/eligibility");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return { nextUrl: url } as never;
}

async function get(params: Record<string, string>) {
  const response = await GET(request(params));
  return { status: response.status, body: await response.json() };
}

describe("GET /api/jpool/eligibility", () => {
  const verdict = {
    eligible: true,
    reason: null,
    epoch: 1045,
    source: "jpool"
  };

  beforeEach(() => {
    getJpoolEligibilityMock.mockReset().mockResolvedValue(verdict);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("returns the verdict, defaulting to mainnet", async () => {
    await expect(get({ vote: VOTE })).resolves.toEqual({
      status: 200,
      body: verdict
    });
    expect(getJpoolEligibilityMock).toHaveBeenCalledWith("mainnet", VOTE);
  });

  it.each([
    [{ vote: VOTE, network: "devnet" }, "JPOOL_MAINNET_ONLY"],
    [{ vote: VOTE, network: "other" }, "JPOOL_MAINNET_ONLY"],
    [{}, "INVALID_VOTE_ACCOUNT"],
    [{ vote: "not-a-key" }, "INVALID_VOTE_ACCOUNT"]
  ])("rejects %j with %s", async (params, code) => {
    const result = await get(params);
    expect(result.status).toBe(400);
    expect(result.body.code).toBe(code);
    expect(getJpoolEligibilityMock).not.toHaveBeenCalled();
  });

  it("maps an unexpected failure to 500", async () => {
    getJpoolEligibilityMock.mockRejectedValue(new Error("boom"));
    const result = await get({ vote: VOTE });
    expect(result.status).toBe(500);
    expect(result.body.code).toBe("JPOOL_ELIGIBILITY_FAILED");
  });
});
