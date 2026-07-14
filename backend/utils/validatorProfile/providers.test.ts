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
  fetchTrilliumProfile,
  fetchValidatorsAppProfile,
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
    await expect(fetchTrilliumProfile(context("devnet"))).resolves.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("aborts a provider request after its timeout", async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockImplementation((_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError"))
        );
      })
    );

    const request = fetchStakewizProfile(context());
    const rejection = expect(request).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(2_500);
    await rejection;
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

  it("selects the matching Trillium logo", async () => {
    vi.mocked(fetch).mockResolvedValue(
      response([{ vote_account_pubkey: "vote", icon_url: "https://logo.example/logo.png" }])
    );

    await expect(fetchTrilliumProfile(context())).resolves.toMatchObject({
      source: "trillium",
      values: { logoUrl: "https://logo.example/logo.png" },
    });
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
    await expect(fetchTrilliumProfile(context())).rejects.toThrow(
      "Unexpected Trillium response format"
    );
  });
});
