import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { addressMock, assertIsAddressMock, getValidatorProfileMock } = vi.hoisted(
  () => ({
    addressMock: vi.fn((value: string) => {
      if (value === "invalid") throw new Error("bad key");
      return value;
    }),
    assertIsAddressMock: vi.fn(),
    getValidatorProfileMock: vi.fn(),
  })
);

vi.mock("@solana/kit", () => ({
  address: addressMock,
  assertIsAddress: assertIsAddressMock,
}));

vi.mock("@/utils/validatorProfile/service", () => ({
  getValidatorProfile: getValidatorProfileMock,
}));

import { GET } from "./route";

function request(url: string) {
  return { nextUrl: new URL(url) } as unknown as NextRequest;
}

describe("GET /api/validator/profile", () => {
  beforeEach(() => {
    addressMock.mockClear();
    assertIsAddressMock.mockClear();
    getValidatorProfileMock.mockReset().mockResolvedValue({
      network: "mainnet",
      voteAccount: "vote",
      name: null,
      description: null,
      logoUrl: null,
      estimatedApyPercent: null,
      commissionPercent: null,
      mevCommissionPercent: null,
      mevEnabled: null,
      status: "unavailable",
      fields: {},
    });
  });

  it("requires a supported network", async () => {
    const missing = await GET(
      request("http://localhost/api/validator/profile?voteAccount=vote")
    );
    expect(missing.status).toBe(400);
    await expect(missing.json()).resolves.toEqual({
      error: "network must be mainnet or devnet",
    });

    const invalid = await GET(
      request(
        "http://localhost/api/validator/profile?network=testnet&voteAccount=vote"
      )
    );
    expect(invalid.status).toBe(400);
  });

  it("requires and validates the vote account", async () => {
    const missing = await GET(
      request("http://localhost/api/validator/profile?network=mainnet")
    );
    expect(missing.status).toBe(400);
    await expect(missing.json()).resolves.toEqual({
      error: "voteAccount parameter is required",
    });

    const invalid = await GET(
      request(
        "http://localhost/api/validator/profile?network=mainnet&voteAccount=invalid"
      )
    );
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toEqual({
      error: "Invalid voteAccount address",
    });
    expect(getValidatorProfileMock).not.toHaveBeenCalled();
  });

  it("returns partial and unavailable profiles with HTTP 200", async () => {
    getValidatorProfileMock.mockResolvedValueOnce({
      network: "mainnet",
      voteAccount: "vote",
      name: "Validator",
      status: "partial",
    });
    const partial = await GET(
      request(
        "http://localhost/api/validator/profile?network=mainnet&voteAccount=vote"
      )
    );
    expect(partial.status).toBe(200);
    await expect(partial.json()).resolves.toMatchObject({ status: "partial" });
    expect(getValidatorProfileMock).toHaveBeenCalledWith("mainnet", "vote");

    const unavailable = await GET(
      request(
        "http://localhost/api/validator/profile?network=mainnet&voteAccount=vote"
      )
    );
    expect(unavailable.status).toBe(200);
    await expect(unavailable.json()).resolves.toMatchObject({
      status: "unavailable",
    });
  });

  it("maps unexpected aggregation errors to HTTP 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    getValidatorProfileMock.mockRejectedValue(new Error("boom"));

    const response = await GET(
      request(
        "http://localhost/api/validator/profile?network=devnet&voteAccount=vote"
      )
    );
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to aggregate validator profile",
    });
  });
});
