import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  addressMock,
  getValidatorLogoMock,
  operationalLogMock,
  recordLogoResponseMock
} = vi.hoisted(() => ({
  addressMock: vi.fn((value: string) => {
    if (value === "invalid") throw new Error("bad key");
    return value;
  }),
  getValidatorLogoMock: vi.fn(),
  operationalLogMock: vi.fn(),
  recordLogoResponseMock: vi.fn()
}));

vi.mock("@solana/kit", () => ({
  address: addressMock,
  assertIsAddress: vi.fn()
}));
vi.mock("@/utils/validatorProfile/service", () => ({
  getValidatorLogo: getValidatorLogoMock
}));
vi.mock("@/utils/observability/logger", () => ({
  errorMessage: (error: unknown) =>
    error instanceof Error ? error.message : String(error),
  operationalLog: operationalLogMock
}));
vi.mock("@/utils/observability/metrics", () => ({
  recordLogoResponse: recordLogoResponseMock
}));

import { GET } from "./route";

function request(url: string) {
  return { nextUrl: new URL(url) } as unknown as NextRequest;
}

describe("GET /api/validator/logo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getValidatorLogoMock.mockResolvedValue({
      network: "mainnet",
      voteAccount: "vote",
      logoUrl: null,
      status: "unavailable",
      field: { source: null, observedAt: null, stale: false }
    });
  });

  it("validates network and vote account", async () => {
    const network = await GET(
      request("http://localhost/api/validator/logo?voteAccount=vote")
    );
    expect(network.status).toBe(400);

    const vote = await GET(
      request(
        "http://localhost/api/validator/logo?network=mainnet&voteAccount=invalid"
      )
    );
    expect(vote.status).toBe(400);
    expect(getValidatorLogoMock).not.toHaveBeenCalled();
  });

  it("returns unavailable logos with HTTP 200", async () => {
    const response = await GET(
      request(
        "http://localhost/api/validator/logo?network=mainnet&voteAccount=vote"
      )
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      logoUrl: null,
      status: "unavailable"
    });
    expect(getValidatorLogoMock).toHaveBeenCalledWith("mainnet", "vote");
    expect(recordLogoResponseMock).toHaveBeenCalledWith(
      "mainnet",
      expect.objectContaining({ status: "unavailable" }),
      expect.any(Number)
    );
  });

  it("maps unexpected aggregation errors to HTTP 500", async () => {
    getValidatorLogoMock.mockRejectedValue(new Error("boom"));
    const response = await GET(
      request(
        "http://localhost/api/validator/logo?network=devnet&voteAccount=vote"
      )
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to aggregate validator logo"
    });
    expect(recordLogoResponseMock).toHaveBeenCalledWith(
      "devnet",
      null,
      expect.any(Number)
    );
    expect(operationalLogMock).toHaveBeenCalledWith(
      "error",
      "validator_logo_aggregation_failed",
      expect.objectContaining({ network: "devnet", error: "boom" })
    );
  });
});
