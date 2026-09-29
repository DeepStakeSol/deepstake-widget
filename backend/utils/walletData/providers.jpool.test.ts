import {
  address,
  getAddressEncoder,
  getBase64Decoder,
  getBase64Encoder,
  getU64Encoder,
  type Address
} from "@solana/kit";
import {
  findAssociatedTokenPda,
  TOKEN_PROGRAM_ADDRESS
} from "@solana-program/token";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import apiFixtures from "@/test/fixtures/jpool-api.json";
import poolFixture from "@/test/fixtures/jpool-stake-pool.json";
import { decodeStakePoolAccount } from "@/utils/solana/blaze/stake-pool";

const { accounts, rpcState } = vi.hoisted(() => ({
  accounts: new Map<string, unknown>(),
  rpcState: { down: false, noEndpoint: false }
}));

vi.mock("../solana/rpc", () => ({
  createRpcConnection: vi.fn(() => {
    if (rpcState.noEndpoint) throw new Error("MAINNET_RPC_ENDPOINT not set");
    return {
      getAccountInfo: vi.fn((account: string) => ({
        send: () =>
          rpcState.down
            ? Promise.reject(new Error("rpc down"))
            : Promise.resolve({ value: accounts.get(account) ?? null })
      }))
    };
  })
}));

import {
  fetchJpoolManage,
  jpoolManagePolicy,
  type JpoolManageResponse
} from "./providers";
import { WALLET_CACHE_POLICIES } from "./service";

const POOL = "CtMyWsrUtAwXWiGr9WjHT5fC3p3fgV8cyGpLTo2LJzG1";
const JSOL = address("7Q2afV64in6N6SeZsAAB81TJzwDoD6zpqmHkzi9Dcavn");
const VOTE = "DeEpSdaw8uBLQ5T2HQhDf8fBSVbm13jGqJwoSF3HTpL5";
const WALLET = address("4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T");
const pool = decodeStakePoolAccount(
  new Uint8Array(getBase64Encoder().encode(poolFixture.data))
);
let ata: Address;

function tokenAccount(amount: bigint, mint: Address = JSOL) {
  const bytes = new Uint8Array(72);
  bytes.set(getAddressEncoder().encode(mint), 0);
  bytes.set(getAddressEncoder().encode(WALLET), 32);
  bytes.set(getU64Encoder().encode(amount), 64);
  return {
    owner: TOKEN_PROGRAM_ADDRESS,
    data: [getBase64Decoder().decode(bytes), "base64"]
  };
}

type Upstream = { binding: unknown; find: unknown };

function jpoolApi(upstream: Partial<Record<keyof Upstream, unknown>>) {
  return vi.fn(async (url: string) => {
    const key: keyof Upstream = url.includes("/wallet-binding/")
      ? "binding"
      : "find";
    const value = upstream[key];
    if (value instanceof Error) throw value;
    if (value instanceof Response) return value;
    return new Response(JSON.stringify(value ?? null), { status: 200 });
  }) as unknown as typeof fetch;
}

const ok = {
  wallet: "ok",
  pool: "ok",
  binding: "ok",
  directStakes: "ok"
} as const;

describe("fetchJpoolManage", () => {
  beforeAll(async () => {
    [ata] = await findAssociatedTokenPda({
      owner: WALLET,
      mint: JSOL,
      tokenProgram: TOKEN_PROGRAM_ADDRESS
    });
  });

  beforeEach(() => {
    accounts.clear();
    accounts.set(POOL, { owner: poolFixture.owner, data: [poolFixture.data, "base64"] });
    accounts.set(ata, tokenAccount(BigInt(7264213)));
    rpcState.down = false;
    rpcState.noEndpoint = false;
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("reports bound_here and sums direct records with the binding amount", async () => {
    const result = await fetchJpoolManage(
      "mainnet",
      WALLET,
      VOTE,
      jpoolApi({
        binding: { ...apiFixtures.bindingBoundHere, amount: "1000" },
        find: apiFixtures.directStakes
      })
    );
    expect(result).toEqual({
      wallet: WALLET,
      network: "mainnet",
      voteAccount: VOTE,
      walletAtaBalance: "7264213",
      ataExists: true,
      portfolioBalance: null,
      poolRate: {
        totalLamports: pool.totalLamports.toString(),
        poolTokenSupply: pool.poolTokenSupply.toString()
      },
      binding: {
        voteId: VOTE,
        amount: "1000",
        updatedAt: "2026-09-22T10:00:00.000Z"
      },
      directStakes: [
        {
          id: "842",
          voteId: VOTE,
          poolTokenAmount: "7264213",
          balanceAmount: "7264213",
          availableAmount: "7264213",
          createdAt: "2026-09-20T10:00:04.000Z"
        },
        {
          id: "843",
          voteId: VOTE,
          poolTokenAmount: "1000",
          balanceAmount: "1000",
          availableAmount: "500",
          createdAt: "2026-09-23T10:00:00.000Z"
        }
      ],
      countedForValidator: String(7264213 + 500 + 1000),
      sources: ok,
      uiStatus: "bound_here"
    } satisfies JpoolManageResponse);
  });

  it("reports not_bound for a wallet that never touched JPool", async () => {
    accounts.delete(ata);
    const result = await fetchJpoolManage(
      "mainnet",
      WALLET,
      VOTE,
      jpoolApi({ binding: null, find: [] })
    );
    expect(result).toMatchObject({
      walletAtaBalance: "0",
      ataExists: false,
      binding: null,
      directStakes: [],
      countedForValidator: "0",
      sources: ok,
      uiStatus: "not_bound"
    });
  });

  it("does not count a binding to another validator", async () => {
    const result = await fetchJpoolManage(
      "mainnet",
      WALLET,
      VOTE,
      jpoolApi({
        binding: apiFixtures.bindingElsewhereNumberAmount,
        find: [apiFixtures.directStakes[0]]
      })
    );
    expect(result).toMatchObject({
      binding: { voteId: "Vote111111111111111111111111111111111111111" },
      countedForValidator: "7264213",
      uiStatus: "bound_elsewhere"
    });
  });

  it("reports error but keeps balance and rate when the binding API fails", async () => {
    const result = await fetchJpoolManage(
      "mainnet",
      WALLET,
      VOTE,
      jpoolApi({
        binding: new Response("bad gateway", { status: 502 }),
        find: apiFixtures.directStakes
      })
    );
    expect(result).toMatchObject({
      walletAtaBalance: "7264213",
      poolRate: { totalLamports: pool.totalLamports.toString() },
      binding: null,
      countedForValidator: null,
      sources: { ...ok, binding: "unavailable" },
      uiStatus: "error"
    });
  });

  it("treats a voteId/boundTo mismatch as an unavailable binding", async () => {
    const result = await fetchJpoolManage(
      "mainnet",
      WALLET,
      VOTE,
      jpoolApi({ binding: apiFixtures.bindingMismatch, find: [] })
    );
    expect(result.sources.binding).toBe("unavailable");
    expect(result.uiStatus).toBe("error");
  });

  it("keeps the binding status but nulls the total when /find fails", async () => {
    const result = await fetchJpoolManage(
      "mainnet",
      WALLET,
      VOTE,
      jpoolApi({
        binding: apiFixtures.bindingBoundHere,
        find: new TypeError("fetch failed")
      })
    );
    expect(result).toMatchObject({
      directStakes: null,
      countedForValidator: null,
      sources: { ...ok, directStakes: "unavailable" },
      uiStatus: "bound_here"
    });
  });

  it("nulls the total when the bound-here amount is unreadable", async () => {
    const result = await fetchJpoolManage(
      "mainnet",
      WALLET,
      VOTE,
      jpoolApi({
        binding: { ...apiFixtures.bindingBoundHere, amount: "n/a" },
        find: []
      })
    );
    expect(result).toMatchObject({
      binding: { amount: null },
      countedForValidator: null,
      uiStatus: "bound_here"
    });
  });

  it("never reads an RPC failure as a missing ATA", async () => {
    rpcState.down = true;
    const result = await fetchJpoolManage(
      "mainnet",
      WALLET,
      VOTE,
      jpoolApi({ binding: null, find: [] })
    );
    expect(result).toMatchObject({
      walletAtaBalance: null,
      ataExists: null,
      poolRate: null,
      sources: { ...ok, wallet: "unavailable", pool: "unavailable" },
      uiStatus: "not_bound"
    });

    rpcState.down = false;
    rpcState.noEndpoint = true;
    const noEndpoint = await fetchJpoolManage(
      "mainnet",
      WALLET,
      VOTE,
      jpoolApi({ binding: null, find: [] })
    );
    expect(noEndpoint.sources).toEqual({
      ...ok,
      wallet: "unavailable",
      pool: "unavailable"
    });
  });

  it("rejects an unexpected account at the ATA address", async () => {
    accounts.set(ata, tokenAccount(BigInt(1), address(POOL)));
    const result = await fetchJpoolManage(
      "mainnet",
      WALLET,
      VOTE,
      jpoolApi({ binding: null, find: [] })
    );
    expect(result.ataExists).toBeNull();
    expect(result.sources.wallet).toBe("unavailable");
  });

  it("throws for networks without a JPool pool", async () => {
    await expect(
      fetchJpoolManage("devnet", WALLET, VOTE, jpoolApi({}))
    ).rejects.toThrow("mainnet only");
  });
});

describe("jpoolManagePolicy", () => {
  const healthy = { sources: ok } as unknown as JpoolManageResponse;

  it("uses the Vault TTLs normally", () => {
    expect(jpoolManagePolicy(healthy, { recentlyMutated: false })).toBe(
      WALLET_CACHE_POLICIES.jpool
    );
    expect(WALLET_CACHE_POLICIES.jpool).toEqual(WALLET_CACHE_POLICIES.vault);
  });

  it("uses the short policy after a mutation or with a degraded source", () => {
    expect(jpoolManagePolicy(healthy, { recentlyMutated: true })).toBe(
      WALLET_CACHE_POLICIES.jpoolRecent
    );
    expect(
      jpoolManagePolicy(
        { sources: { ...ok, binding: "unavailable" } } as unknown as JpoolManageResponse,
        { recentlyMutated: false }
      )
    ).toBe(WALLET_CACHE_POLICIES.jpoolRecent);
  });
});
