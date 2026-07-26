import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const accountSends = new Map<string, ReturnType<typeof vi.fn>>();
  const accountSend = (account: string) => {
    if (!accountSends.has(account)) accountSends.set(account, vi.fn());
    return accountSends.get(account)!;
  };
  return {
    accountSends,
    accountSend,
    balanceSend: vi.fn(),
    latestBlockhashSend: vi.fn(),
    simulationSend: vi.fn(),
    createRpcConnection: vi.fn(),
    getRpcEndpoint: vi.fn(),
    getPriorityFeeEstimate: vi.fn(),
    decodeStakePool: vi.fn(),
    decodeDirectorStakeTarget: vi.fn(),
    decodeDstInfo: vi.fn(),
    createAta: vi.fn(() => ({ type: "create-ata" })),
    depositSol: vi.fn(() => ({ type: "deposit-sol" })),
    initDirector: vi.fn(() => ({ type: "init-director" })),
    setStakeTarget: vi.fn(() => ({ type: "set-target" })),
    mintDst: vi.fn(() => ({ type: "mint-dst" })),
    compileTransaction: vi.fn(() => "compiled-transaction"),
    computeLimit: vi.fn((input) => ({ type: "limit", input })),
    computePrice: vi.fn((input) => ({ type: "price", input }))
  };
});

vi.mock("@solana/kit", () => ({
  address: vi.fn((value: string) => value),
  appendTransactionMessageInstructions: vi.fn((instructions, message) => ({
    ...message,
    instructions: [...(message.instructions ?? []), ...instructions]
  })),
  compileTransaction: mocks.compileTransaction,
  createNoopSigner: vi.fn((value: string) => ({ address: value })),
  createTransactionMessage: vi.fn(() => ({ version: 0, instructions: [] })),
  getBase64EncodedWireTransaction: vi.fn(() => "vault-transaction-base64"),
  getBase64Encoder: vi.fn(() => ({
    encode: vi.fn(() => new Uint8Array([1, 2, 3]))
  })),
  pipe: vi.fn((value, ...fns) =>
    fns.reduce((current, fn) => fn(current), value)
  ),
  setTransactionMessageFeePayer: vi.fn((feePayer, message) => ({
    ...message,
    feePayer
  })),
  setTransactionMessageLifetimeUsingBlockhash: vi.fn((blockhash, message) => ({
    ...message,
    blockhash
  }))
}));

vi.mock("@solana-program/token", () => ({
  TOKEN_PROGRAM_ADDRESS: "token-program",
  findAssociatedTokenPda: vi.fn(({ mint }) =>
    Promise.resolve([mint === "vsol-mint" ? "vsol-ata" : "lst-ata", 255])
  )
}));

vi.mock("@solana-program/compute-budget", () => ({
  getSetComputeUnitLimitInstruction: mocks.computeLimit,
  getSetComputeUnitPriceInstruction: mocks.computePrice
}));

vi.mock("@/utils/consts", () => ({
  STAKE_POOL_ADDRESS: "stake-pool",
  VSOL_MINT: "vsol-mint"
}));

vi.mock("@/utils/priorityFee", () => ({
  getPriorityFeeEstimate: mocks.getPriorityFeeEstimate
}));

vi.mock("@/utils/solana/rpc", () => ({
  createRpcConnection: mocks.createRpcConnection,
  getRpcEndpoint: mocks.getRpcEndpoint
}));

vi.mock("@/utils/solana/blaze/stake-pool", () => ({
  STAKE_POOL_PROGRAM_ADDRESS: "stake-pool-program",
  decodeStakePoolAccount: mocks.decodeStakePool,
  findStakePoolWithdrawAuthority: vi.fn(() =>
    Promise.resolve("withdraw-authority")
  ),
  getCreateAssociatedTokenAccountInstruction: mocks.createAta,
  getDepositSolInstruction: mocks.depositSol
}));

vi.mock("@/utils/solana/vault/instructions", () => ({
  DIRECTED_STAKE_PROGRAM_ADDRESS: "directed-program",
  DST_PROGRAM_ADDRESS: "dst-program",
  decodeDirectorStakeTarget: mocks.decodeDirectorStakeTarget,
  decodeDstInfoAccount: mocks.decodeDstInfo,
  findDirectorAddress: vi.fn(() => Promise.resolve("director")),
  findDstInfoAddress: vi.fn(() => Promise.resolve("dst")),
  getInitDirectorInstruction: mocks.initDirector,
  getMintDstInstruction: mocks.mintDst,
  getSetStakeTargetInstruction: mocks.setStakeTarget
}));

import { GET } from "./route";

function request(url: string) {
  return { nextUrl: new URL(url) } as unknown as NextRequest;
}

const baseUrl =
  "http://localhost/api/vstake?network=devnet&address=wallet&mint=vsol-mint&amount=100&balance=80";

function account(value: unknown) {
  return { value };
}

describe("GET /api/vstake", () => {
  beforeEach(() => {
    mocks.accountSends.clear();
    mocks.getRpcEndpoint.mockReset().mockReturnValue("https://rpc.example");
    mocks.createRpcConnection.mockReset().mockReturnValue({
      getAccountInfo: vi.fn((address: string) => ({
        send: mocks.accountSend(address)
      })),
      getBalance: vi.fn(() => ({ send: mocks.balanceSend })),
      getLatestBlockhash: vi.fn(() => ({ send: mocks.latestBlockhashSend })),
      simulateTransaction: vi.fn(() => ({ send: mocks.simulationSend }))
    });
    mocks.accountSend("vsol-ata").mockResolvedValue(account({}));
    mocks
      .accountSend("stake-pool")
      .mockResolvedValue(
        account({ owner: "stake-pool-program", data: ["pool", "base64"] })
      );
    mocks.accountSend("director").mockResolvedValue(account(null));
    mocks
      .accountSend("dst")
      .mockResolvedValue(
        account({ owner: "dst-program", data: ["dst", "base64"] })
      );
    mocks.accountSend("lst-ata").mockResolvedValue(account({}));
    mocks.balanceSend.mockReset().mockResolvedValue({ value: BigInt(1_000) });
    mocks.latestBlockhashSend.mockReset().mockResolvedValue({
      value: { blockhash: "blockhash", lastValidBlockHeight: BigInt(10) }
    });
    mocks.simulationSend.mockReset().mockResolvedValue({
      value: { err: null, unitsConsumed: BigInt(50_000) }
    });
    mocks.getPriorityFeeEstimate
      .mockReset()
      .mockResolvedValue({ priorityFeeEstimate: 100 });
    mocks.decodeStakePool.mockReset().mockReturnValue({
      reserveStake: "reserve",
      poolMint: "vsol-mint",
      managerFeeAccount: "fee",
      tokenProgram: "token-program",
      totalLamports: BigInt(1_000),
      poolTokenSupply: BigInt(500),
      lastUpdateEpoch: BigInt(1)
    });
    mocks.decodeDirectorStakeTarget.mockReset().mockReturnValue("other-target");
    mocks.decodeDstInfo.mockReset().mockReturnValue({
      tokenMint: "lst-mint",
      vsolReserves: "vsol-reserves"
    });
    mocks.createAta.mockClear();
    mocks.depositSol.mockClear();
    mocks.initDirector.mockClear();
    mocks.setStakeTarget.mockClear();
    mocks.mintDst.mockClear();
    mocks.computeLimit.mockClear();
    mocks.computePrice.mockClear();
    mocks.compileTransaction.mockClear();
  });

  it("requires address, mint, amount, and balance", async () => {
    await expect(
      (
        await GET(
          request("http://localhost/api/vstake?mint=m&amount=1&balance=1")
        )
      ).json()
    ).resolves.toEqual({ error: "Missing required parameter: address" });
    await expect(
      (
        await GET(
          request("http://localhost/api/vstake?address=w&amount=1&balance=1")
        )
      ).json()
    ).resolves.toEqual({ error: "Missing required parameter: mint" });
    await expect(
      (
        await GET(
          request("http://localhost/api/vstake?address=w&mint=m&balance=1")
        )
      ).json()
    ).resolves.toEqual({ error: "Missing required parameter: amount" });
    await expect(
      (
        await GET(
          request("http://localhost/api/vstake?address=w&mint=m&amount=1")
        )
      ).json()
    ).resolves.toEqual({ error: "Missing required parameter: balance" });
  });

  it("requires a configured RPC endpoint", async () => {
    mocks.getRpcEndpoint.mockReturnValue("");
    const response = await GET(request(baseUrl));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "RPC endpoint not configured"
    });
  });

  it("builds a v0 transaction and caps the deposit at the supplied balance", async () => {
    mocks.accountSend("vsol-ata").mockResolvedValue(account(null));
    const response = await GET(request(baseUrl));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      transaction: "vault-transaction-base64"
    });
    expect(mocks.createAta).toHaveBeenCalledTimes(1);
    expect(mocks.depositSol).toHaveBeenCalledWith(
      expect.objectContaining({ lamports: BigInt(80) })
    );
    expect(mocks.computeLimit).toHaveBeenCalledWith({ units: 53_000 });
    expect(mocks.computePrice).toHaveBeenCalledWith({ microLamports: 100 });
  });

  it("preserves directed-stake initialization, updates, and no-op behavior", async () => {
    await GET(request(baseUrl + "&target=validator"));
    expect(mocks.initDirector).toHaveBeenCalledTimes(1);
    expect(mocks.setStakeTarget).toHaveBeenCalledTimes(1);

    mocks.initDirector.mockClear();
    mocks.setStakeTarget.mockClear();
    mocks
      .accountSend("director")
      .mockResolvedValue(
        account({ owner: "directed-program", data: ["director", "base64"] })
      );
    mocks.decodeDirectorStakeTarget.mockReturnValue("validator");
    await GET(request(baseUrl + "&target=validator"));
    expect(mocks.initDirector).not.toHaveBeenCalled();
    expect(mocks.setStakeTarget).not.toHaveBeenCalled();
  });

  it("rejects direct staking with a non-vSOL mint", async () => {
    const response = await GET(
      request(
        baseUrl.replace("mint=vsol-mint", "mint=lst-mint") + "&target=validator"
      )
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Must use vSOL mint for direct staking"
    });
  });

  it("builds the DST ATA and mint instruction with integer pool conversion", async () => {
    mocks.accountSend("lst-ata").mockResolvedValue(account(null));
    const response = await GET(
      request(baseUrl.replace("mint=vsol-mint", "mint=lst-mint"))
    );
    expect(response.status).toBe(200);
    expect(mocks.createAta).toHaveBeenCalledWith(
      expect.objectContaining({ ata: "lst-ata", mint: "lst-mint" })
    );
    expect(mocks.mintDst).toHaveBeenCalledWith(
      expect.objectContaining({
        dst: "dst",
        vsolReserves: "vsol-reserves",
        amount: BigInt(40)
      })
    );
  });

  it("returns simulation failures as 400", async () => {
    mocks.simulationSend.mockResolvedValue({ value: { err: "sim-error" } });
    const response = await GET(request(baseUrl));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Vault transaction simulation failed",
      details: "sim-error"
    });
  });

  it("rejects invalid stake-pool ownership and insufficient funds", async () => {
    mocks
      .accountSend("stake-pool")
      .mockResolvedValue(
        account({ owner: "wrong-program", data: ["pool", "base64"] })
      );
    let response = await GET(request(baseUrl));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid stake pool account owner"
    });

    mocks
      .accountSend("stake-pool")
      .mockResolvedValue(
        account({ owner: "stake-pool-program", data: ["pool", "base64"] })
      );
    mocks.balanceSend.mockResolvedValue({ value: BigInt(10) });
    response = await GET(request(baseUrl));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error:
        "Not enough SOL to deposit into pool. Maximum deposit amount is 1e-8 SOL."
    });
  });
});
