import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/utils/solana/rpc", () => ({
  getRpcEndpoint: (network: string) =>
    network === "mainnet"
      ? process.env.MAINNET_RPC_ENDPOINT || ""
      : process.env.DEVNET_RPC_ENDPOINT || "",
}));

import {
  fetchJitoProfile,
  fetchSolanaProfile,
  fetchStakewizProfile,
  fetchValidatorsAppProfile,
  validatorProfileProviderConfigs,
} from "./providers";

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

function context(network: "mainnet" | "devnet" = "mainnet") {
  return {
    network,
    voteAccount: "vote",
    signal: new AbortController().signal,
  };
}

describe("validator profile providers", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    vi.stubEnv("VALIDATORS_APP_TOKEN", "");
    vi.stubEnv("MAINNET_RPC_ENDPOINT", "https://rpc.example");
    vi.stubEnv("DEVNET_RPC_ENDPOINT", "https://devnet-rpc.example");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("configures named provider-specific deadlines", () => {
    expect(
      Object.fromEntries(
        validatorProfileProviderConfigs.map(({ id, timeoutMs }) => [
          id,
          timeoutMs,
        ])
      )
    ).toEqual({
      stakewiz: 8_000,
      jito: 8_000,
      "solana-rpc": 8_000,
      "validators-app": 5_000,
    });
  });

  it("normalizes and bounds Stakewiz fields", async () => {
    vi.mocked(fetch).mockResolvedValue(
      response({
        name: "Validator",
        description: "Description",
        image: "https://logo.example/logo.png",
        total_apy: 7.1,
        commission: 101,
        is_jito: true,
        jito_commission_bps: 250,
        updated_at: "2026-07-14T10:00:00Z",
      })
    );

    await expect(fetchStakewizProfile(context())).resolves.toMatchObject({
      source: "stakewiz",
      observedAt: "2026-07-14T10:00:00.000Z",
      values: {
        name: "Validator",
        estimatedApyPercent: 7.1,
        commissionPercent: null,
        mevEnabled: true,
        mevCommissionPercent: 2.5,
      },
    });
  });

  it("does not query mainnet-only metadata providers for devnet", async () => {
    await expect(fetchStakewizProfile(context("devnet"))).resolves.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("forwards caller cancellation to the provider request", async () => {
    const controller = new AbortController();
    vi.mocked(fetch).mockImplementation((_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError"))
        );
      })
    );

    const request = fetchStakewizProfile({
      ...context(),
      signal: controller.signal,
    });
    controller.abort();

    await expect(request).rejects.toMatchObject({ name: "AbortError" });
  });

  it("reads authoritative commission from Solana vote accounts", async () => {
    vi.mocked(fetch).mockResolvedValue(
      response({ result: { current: [], delinquent: [{ votePubkey: "vote", commission: 0 }] } })
    );

    await expect(fetchSolanaProfile(context())).resolves.toMatchObject({
      source: "solana-rpc",
      values: { commissionPercent: 0 },
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://rpc.example",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"method":"getVoteAccounts"'),
      })
    );
  });

  it("normalizes Jito basis points and skips Jito on devnet", async () => {
    vi.mocked(fetch).mockResolvedValue(response([{ mev_commission_bps: 125 }]));

    await expect(fetchJitoProfile(context())).resolves.toMatchObject({
      values: { mevEnabled: true, mevCommissionPercent: 1.25 },
    });
    vi.mocked(fetch).mockClear();
    await expect(fetchJitoProfile(context("devnet"))).resolves.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("uses a configured Validators.app avatar for the requested vote account", async () => {
    vi.stubEnv("VALIDATORS_APP_TOKEN", "test-token");
    vi.mocked(fetch).mockResolvedValue(
      response([
        { vote_account: "other", avatar_url: "https://logo.example/other.png" },
        { vote_account: "vote", avatar_url: "https://logo.example/fallback.png" }
      ])
    );

    await expect(fetchValidatorsAppProfile(context())).resolves.toMatchObject({
      source: "validators-app",
      values: { logoUrl: "https://logo.example/fallback.png" }
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://www.validators.app/api/v1/validators/mainnet/vote.json",
      expect.objectContaining({ headers: { Token: "test-token" } })
    );
  });

  it("does not call Validators.app without a token", async () => {
    await expect(fetchValidatorsAppProfile(context())).resolves.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects failed and malformed provider responses", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response({}, 503))
      .mockResolvedValueOnce(response({ not: "an array" }));

    await expect(fetchStakewizProfile(context())).rejects.toThrow("HTTP 503");
    await expect(fetchJitoProfile(context())).rejects.toThrow(
      "Unexpected Jito response format"
    );
  });
});
