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
  fetchSolanaValidatorInfoProfile,
  fetchStakewizProfile,
  fetchValidatorsAppProfile,
  parseValidatorInfoAccount,
  validatorProfileProviderConfigs,
} from "./providers";

// DeepStake validator-info Config accounts, read from the chain on 2026-10-12
// (`getProgramAccounts Config111…` with memcmp on the identity). The real
// accounts are 643 bytes; the zero padding after the JSON is trimmed here.
const DEVNET_IDENTITY = "deepEMPe2gRjCPQ4E1VzmbDTNXt7skZie7vJbWKnpUH";
const DEVNET_VALIDATOR_INFO =
  "AgdRlwF0SPKsXcI8nrx6x4wKJyV6xhRFjeCk8W+AAAAAAAlje3sGRC9xFVaAjtc4i3flpm/B1n2PDNTh24XgersSAY8AAAAAAAAAeyJkZXRhaWxzIjoiSWYgeW91IGtub3csIHlvdSBrbm93IiwiaWNvblVybCI6Imh0dHBzOi8vZGVlcHN0YWtlLmluZm8vZGVlcHN0YWtlX2xvZ28ucG5nIiwibmFtZSI6IkRlZXBTdGFrZSIsIndlYnNpdGUiOiJodHRwczovL2RlZXBzdGFrZS5pbmZvIn0=";
const MAINNET_IDENTITY = "DeepM3FDWaAb7o53rvyZk5YvHLG3FvDiVXJLRY78z51p";
const MAINNET_VALIDATOR_INFO =
  "AgdRlwF0SPKsXcI8nrx6x4wKJyV6xhRFjeCk8W+AAAAAALvxffj+Qb6wVO/BXDxBqbf1sYteh5mCX+YdESMJY3eXAY8AAAAAAAAAeyJkZXRhaWxzIjoiSWYgeW91IGtub3csIHlvdSBrbm93IiwiaWNvblVybCI6Imh0dHBzOi8vZGVlcHN0YWtlLmluZm8vZGVlcHN0YWtlX2xvZ28ucG5nIiwibmFtZSI6IkRlZXBTdGFrZSIsIndlYnNpdGUiOiJodHRwczovL2RlZXBzdGFrZS5pbmZvIn0=";
const DEEPSTAKE_INFO = {
  name: "DeepStake",
  details: "If you know, you know",
  website: "https://deepstake.info",
  iconUrl: "https://deepstake.info/deepstake_logo.png",
};

function bytes(base64: string): Uint8Array {
  return Uint8Array.from(Buffer.from(base64, "base64"));
}

function validatorInfoAccount(json: string, identityBytes = bytes(DEVNET_VALIDATOR_INFO)) {
  const body = new TextEncoder().encode(json);
  const data = new Uint8Array(75 + body.length);
  data.set(identityBytes.subarray(0, 67));
  new DataView(data.buffer).setBigUint64(67, BigInt(body.length), true);
  data.set(body, 75);
  return data;
}

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
      "solana-validator-info": 8_000,
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

  describe("on-chain validator-info", () => {
    it.each([
      ["devnet", DEVNET_VALIDATOR_INFO, DEVNET_IDENTITY],
      ["mainnet", MAINNET_VALIDATOR_INFO, MAINNET_IDENTITY],
    ])("parses the real DeepStake %s account", (_network, data, identity) => {
      expect(parseValidatorInfoAccount(bytes(data), identity)).toEqual(
        DEEPSTAKE_INFO
      );
    });

    it("ignores the zero padding after the JSON", () => {
      const padded = new Uint8Array(643);
      padded.set(bytes(DEVNET_VALIDATOR_INFO));
      expect(parseValidatorInfoAccount(padded, DEVNET_IDENTITY)).toEqual(
        DEEPSTAKE_INFO
      );
    });

    it("rejects records for another identity, unsigned or malformed", () => {
      const data = bytes(DEVNET_VALIDATOR_INFO);
      expect(parseValidatorInfoAccount(data, MAINNET_IDENTITY)).toBeNull();

      const unsigned = data.slice();
      unsigned[66] = 0;
      expect(parseValidatorInfoAccount(unsigned)).toBeNull();

      const notValidatorInfo = data.slice();
      notValidatorInfo[1] ^= 0xff;
      expect(parseValidatorInfoAccount(notValidatorInfo)).toBeNull();

      expect(parseValidatorInfoAccount(data.subarray(0, 120))).toBeNull();

      const oversized = data.slice();
      new DataView(oversized.buffer).setBigUint64(67, 2n ** 40n, true);
      expect(parseValidatorInfoAccount(oversized)).toBeNull();

      expect(parseValidatorInfoAccount(validatorInfoAccount("not json"))).toBeNull();
      expect(parseValidatorInfoAccount(validatorInfoAccount("[1]"))).toBeNull();
    });

    it("keeps only https links", () => {
      expect(
        parseValidatorInfoAccount(
          validatorInfoAccount(
            JSON.stringify({
              name: "Validator",
              iconUrl: "javascript:alert(1)",
              website: "http://example.com",
            })
          )
        )
      ).toEqual({ name: "Validator", details: null, website: null, iconUrl: null });
    });

    it("reads name, details and icon through the vote account identity", async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(
          response({
            result: {
              current: [{ votePubkey: "vote", nodePubkey: DEVNET_IDENTITY }],
              delinquent: [],
            },
          })
        )
        .mockResolvedValueOnce(
          response({
            result: [
              {
                pubkey: "HyuuYUVccp7i6FbuUiewjaP63m1s3MbQSspzB66SDUDg",
                account: { data: [DEVNET_VALIDATOR_INFO, "base64"] },
              },
            ],
          })
        );

      await expect(
        fetchSolanaValidatorInfoProfile(context("devnet"))
      ).resolves.toMatchObject({
        source: "solana-validator-info",
        values: {
          name: "DeepStake",
          description: "If you know, you know",
          logoUrl: "https://deepstake.info/deepstake_logo.png",
        },
      });

      const [endpoint, init] = vi.mocked(fetch).mock.calls[1];
      expect(endpoint).toBe("https://devnet-rpc.example");
      expect(JSON.parse(String(init?.body))).toMatchObject({
        method: "getProgramAccounts",
        params: [
          "Config1111111111111111111111111111111111111",
          {
            encoding: "base64",
            filters: [
              {
                memcmp: {
                  offset: 1,
                  bytes: "Va1idator1nfo111111111111111111111111111111",
                },
              },
              { memcmp: { offset: 34, bytes: DEVNET_IDENTITY } },
            ],
          },
        ],
      });
    });

    it("returns null for an unknown vote account or no published info", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        response({ result: { current: [], delinquent: [] } })
      );
      await expect(
        fetchSolanaValidatorInfoProfile(context("devnet"))
      ).resolves.toBeNull();
      expect(fetch).toHaveBeenCalledTimes(1);

      vi.mocked(fetch)
        .mockResolvedValueOnce(
          response({
            result: {
              current: [],
              delinquent: [{ votePubkey: "vote", nodePubkey: DEVNET_IDENTITY }],
            },
          })
        )
        .mockResolvedValueOnce(response({ result: [] }));
      await expect(
        fetchSolanaValidatorInfoProfile(context("devnet"))
      ).resolves.toBeNull();
    });

    it("rejects RPC errors so the service records a failure", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        response({ error: { code: -32601, message: "Method not found" } })
      );
      await expect(
        fetchSolanaValidatorInfoProfile(context("devnet"))
      ).rejects.toThrow("Unexpected Solana RPC response format");
    });
  });
});
