import { beforeEach, describe, expect, it } from "vitest";

import {
  observeProviderRequest,
  recordCacheOperation,
  recordLogoResponse,
  recordProfileResponse,
  validatorProfileMetrics
} from "./metrics";
import type { ValidatorProfile } from "../validatorProfile/types";

const profile: ValidatorProfile = {
  network: "mainnet",
  voteAccount: "private-vote-label-test",
  name: "Validator",
  description: null,
  logoUrl: null,
  estimatedApyPercent: 6,
  commissionPercent: 5,
  mevCommissionPercent: null,
  mevEnabled: false,
  status: "partial",
  fields: {
    name: {
      source: "stakewiz",
      observedAt: "2026-01-01T00:00:00Z",
      stale: false
    },
    description: { source: null, observedAt: null, stale: false },
    logoUrl: { source: null, observedAt: null, stale: false },
    estimatedApyPercent: {
      source: "stakewiz",
      observedAt: "2026-01-01T00:00:00Z",
      stale: true
    },
    commissionPercent: {
      source: "solana-rpc",
      observedAt: "2026-01-01T00:00:00Z",
      stale: false
    },
    mevCommissionPercent: { source: null, observedAt: null, stale: false },
    mevEnabled: {
      source: "jito",
      observedAt: "2026-01-01T00:00:00Z",
      stale: false
    }
  }
};

describe("validator profile metrics", () => {
  beforeEach(() => {
    validatorProfileMetrics.registry.resetMetrics();
  });

  it("records bounded provider, cache, profile, and field labels", async () => {
    observeProviderRequest("stakewiz", "mainnet", "timeout", 8_000);
    recordCacheOperation("lookup", "stale");
    recordProfileResponse("mainnet", profile, 125);
    recordLogoResponse(
      "mainnet",
      {
        network: "mainnet",
        voteAccount: "private-vote-label-test",
        logoUrl: "https://logo.example/logo.png",
        status: "fresh",
        field: {
          source: "trillium",
          observedAt: "2026-01-01T00:00:00Z",
          stale: false
        }
      },
      250
    );

    const metrics = await validatorProfileMetrics.registry.metrics();
    expect(metrics).toContain(
      'deepstake_validator_provider_requests_total{provider="stakewiz",network="mainnet",outcome="timeout"} 1'
    );
    expect(metrics).toContain(
      'deepstake_validator_cache_operations_total{operation="lookup",result="stale",group="all"} 1'
    );
    expect(metrics).toContain(
      'deepstake_validator_profile_requests_total{network="mainnet",status="partial"} 1'
    );
    expect(metrics).toContain('field="estimatedApyPercent",state="stale"');
    expect(metrics).toContain('field="description",state="missing"');
    expect(metrics).toContain(
      'deepstake_validator_logo_requests_total{network="mainnet",status="fresh"} 1'
    );
    expect(metrics).toContain('field="logoUrl",state="fresh"');
    expect(metrics).not.toContain(profile.voteAccount);
  });
});
