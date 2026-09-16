import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyValidatorLogo,
  applyValidatorOverrides,
  createUnavailableValidatorProfile,
  fetchValidatorLogo,
  fetchValidatorProfile,
  type ValidatorProfile,
  type ValidatorProfileField,
} from "./validator";

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

const fieldNames: ValidatorProfileField[] = [
  "name",
  "description",
  "logoUrl",
  "estimatedApyPercent",
  "commissionPercent",
  "mevCommissionPercent",
  "mevEnabled",
];

function backendProfile(overrides: Record<string, unknown> = {}) {
  return {
    network: "mainnet",
    voteAccount: "vote",
    name: "Validator",
    description: "Description",
    logoUrl: "https://logo.example/logo.png",
    estimatedApyPercent: 7.5,
    commissionPercent: 0,
    mevCommissionPercent: 2.5,
    mevEnabled: true,
    status: "fresh",
    fields: Object.fromEntries(
      fieldNames.map((field) => [
        field,
        {
          source: "provider",
          observedAt: "2026-07-14T10:00:00.000Z",
          stale: false,
        },
      ])
    ),
    ...overrides,
  };
}

describe("validator profile client", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    vi.stubEnv("VITE_BACKEND_URL", "https://backend.example");
    vi.stubEnv("VITE_USE_LEGACY_VALIDATOR_PROFILE", "false");
  });

  it("fetches and validates one backend profile", async () => {
    vi.mocked(fetch).mockResolvedValue(response(backendProfile()));

    await expect(fetchValidatorProfile("vote", "mainnet")).resolves.toMatchObject({
      voteAccount: "vote",
      network: "mainnet",
      name: "Validator",
      commissionPercent: 0,
      status: "fresh",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(
        /\/api\/validator\/profile\?network=mainnet&voteAccount=vote$/
      )
    );
  });

  it("fetches and validates the dedicated logo response", async () => {
    vi.mocked(fetch).mockResolvedValue(
      response({
        network: "mainnet",
        voteAccount: "vote",
        logoUrl: "https://logo.example/trillium.png",
        status: "fresh",
        field: {
          source: "trillium",
          observedAt: "2026-07-14T10:00:00.000Z",
          stale: false,
        },
      })
    );

    await expect(fetchValidatorLogo("vote", "mainnet")).resolves.toMatchObject({
      logoUrl: "https://logo.example/trillium.png",
      status: "fresh",
      field: { source: "trillium" },
    });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(
        /\/api\/validator\/logo\?network=mainnet&voteAccount=vote$/
      )
    );
  });

  it("merges a matching logo without overriding widget configuration", () => {
    const profile = backendProfile({ logoUrl: null }) as unknown as ValidatorProfile;
    const logo = {
      network: "mainnet" as const,
      voteAccount: "vote",
      logoUrl: "https://logo.example/trillium.png",
      status: "fresh" as const,
      field: {
        source: "trillium",
        observedAt: "2026-07-14T10:00:00.000Z",
        stale: false,
      },
    };

    expect(applyValidatorLogo(profile, logo).logoUrl).toBe(logo.logoUrl);
    const overridden = applyValidatorOverrides(profile, {
      validator_logo_url: "https://host.example/logo.png",
    });
    expect(applyValidatorLogo(overridden, logo).logoUrl).toBe(
      "https://host.example/logo.png"
    );
  });

  it("rejects failed, mismatched, and malformed backend profiles", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response({ error: "Validator service unavailable" }, 503))
      .mockResolvedValueOnce(response(backendProfile({ voteAccount: "other" })))
      .mockResolvedValueOnce(response(backendProfile({ commissionPercent: "0" })));

    await expect(fetchValidatorProfile("vote", "mainnet")).rejects.toThrow(
      "Validator service unavailable"
    );
    await expect(fetchValidatorProfile("vote", "mainnet")).rejects.toThrow(
      "does not match"
    );
    await expect(fetchValidatorProfile("vote", "mainnet")).rejects.toThrow(
      "Invalid commissionPercent"
    );
  });

  it("applies non-empty embedder overrides with field provenance", () => {
    const profile = backendProfile() as unknown as ValidatorProfile;
    const result = applyValidatorOverrides(profile, {
      validator_name: "Host name",
      validator_description: "Host description",
      validator_logo_url: "https://host.example/logo.png",
    });

    expect(result).toMatchObject({
      name: "Host name",
      description: "Host description",
      logoUrl: "https://host.example/logo.png",
    });
    expect(result.fields.name).toEqual({
      source: "widget-option",
      observedAt: null,
      stale: false,
    });
    expect(profile.name).toBe("Validator");
  });

  it("builds an unavailable profile and upgrades it to partial with overrides", () => {
    const unavailable = createUnavailableValidatorProfile("vote", "devnet");
    const result = applyValidatorOverrides(unavailable, {
      validator_name: "Host fallback",
    });

    expect(result.status).toBe("partial");
    expect(result.name).toBe("Host fallback");
    expect(result.commissionPercent).toBeNull();
  });

  it("uses the legacy requests only when the rollback flag is enabled", async () => {
    vi.stubEnv("VITE_USE_LEGACY_VALIDATOR_PROFILE", "true");
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        response({
          vote_identity: "vote",
          name: "Legacy validator",
          total_apy: 7,
          commission: 0,
          is_jito: false,
        })
      )
      .mockResolvedValueOnce(
        response([
          {
            vote_account_pubkey: "vote",
            icon_url: "https://legacy.example/logo.png",
          },
        ])
      );

    await expect(fetchValidatorProfile("vote", "mainnet")).resolves.toMatchObject({
      name: "Legacy validator",
      logoUrl: "https://legacy.example/logo.png",
      commissionPercent: 0,
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe(
      "https://api.stakewiz.com/validator/vote"
    );
  });
});
