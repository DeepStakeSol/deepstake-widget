import {
  address,
  getAddressDecoder,
  getAddressEncoder,
  getBase64Encoder,
  getBase64Decoder,
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
  type Address
} from "@solana/kit";
import {
  findAssociatedTokenPda,
  TOKEN_PROGRAM_ADDRESS
} from "@solana-program/token";
import { beforeEach, describe, expect, it, vi } from "vitest";

import jpoolStakePoolFixture from "@/test/fixtures/jpool-stake-pool.json";
import { decodeStakePoolAccount } from "@/utils/solana/blaze/stake-pool";

const { accounts, getPriorityFeeEstimateMock, rpcState } = vi.hoisted(() => ({
  accounts: new Map<string, unknown>(),
  getPriorityFeeEstimateMock: vi.fn(),
  rpcState: {
    epoch: BigInt(0),
    simulation: { err: null as unknown, unitsConsumed: BigInt(40_000) as bigint | null },
    failAccountReads: false,
    blockhash: ""
  }
}));

vi.mock("@/utils/solana/rpc", () => ({
  getRpcEndpoint: vi.fn((network: string) =>
    network === "mainnet" ? "https://rpc.example" : ""
  ),
  createRpcConnection: vi.fn(() => ({
    getAccountInfo: vi.fn((account: string) => ({
      send: () =>
        rpcState.failAccountReads
          ? Promise.reject(new Error("rpc down"))
          : Promise.resolve({ value: accounts.get(account) ?? null })
    })),
    getEpochInfo: vi.fn(() => ({
      send: () => Promise.resolve({ epoch: rpcState.epoch })
    })),
    getLatestBlockhash: vi.fn(() => ({
      send: () =>
        Promise.resolve({
          value: {
            blockhash: rpcState.blockhash,
            lastValidBlockHeight: BigInt(100)
          }
        })
    })),
    simulateTransaction: vi.fn(() => ({
      send: () => Promise.resolve({ value: rpcState.simulation })
    }))
  }))
}));

vi.mock("@/utils/priorityFee", () => ({
  getPriorityFeeEstimate: getPriorityFeeEstimateMock
}));

import { POST } from "./route";

const POOL = "CtMyWsrUtAwXWiGr9WjHT5fC3p3fgV8cyGpLTo2LJzG1";
const JSOL = address("7Q2afV64in6N6SeZsAAB81TJzwDoD6zpqmHkzi9Dcavn");
const VOTE = "DeEpSdaw8uBLQ5T2HQhDf8fBSVbm13jGqJwoSF3HTpL5";
const WALLET = getAddressDecoder().decode(new Uint8Array(32).fill(7));
const PROGRAMS = {
  computeBudget: "ComputeBudget111111111111111111111111111111",
  ata: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
  stakePool: "SPoo1Ku8WFXoNDMHPsrGSTSG1Y47rzgn41SLUNakuHy",
  memo: "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
};

const poolBytes = new Uint8Array(
  getBase64Encoder().encode(jpoolStakePoolFixture.data)
);
let jsolAta: Address;

function tokenAccount(mint: Address, owner: Address) {
  const bytes = new Uint8Array(64);
  bytes.set(getAddressEncoder().encode(mint), 0);
  bytes.set(getAddressEncoder().encode(owner), 32);
  return {
    owner: TOKEN_PROGRAM_ADDRESS,
    data: [getBase64Decoder().decode(bytes), "base64"]
  };
}

function request(
  body: unknown,
  url = "http://localhost/api/jpool/stake/generate?network=mainnet"
) {
  return {
    nextUrl: new URL(url),
    json: () =>
      body instanceof Error ? Promise.reject(body) : Promise.resolve(body)
  } as never;
}

const validBody = {
  wallet: WALLET,
  voteAccount: VOTE,
  stakeLamports: "10000000"
};

function decodeTransaction(base64: string) {
  const transaction = getTransactionDecoder().decode(
    new Uint8Array(getBase64Encoder().encode(base64))
  );
  const message = getCompiledTransactionMessageDecoder().decode(
    transaction.messageBytes
  );
  const accountsList = message.staticAccounts;
  return {
    signers: Object.keys(transaction.signatures),
    message,
    instructions: message.instructions.map((instruction) => ({
      program: accountsList[instruction.programAddressIndex],
      accounts: (instruction.accountIndices ?? []).map(
        (index) => accountsList[index]
      ),
      data: instruction.data ?? new Uint8Array()
    }))
  };
}

describe("POST /api/jpool/stake/generate", () => {
  beforeEach(async () => {
    [jsolAta] = await findAssociatedTokenPda({
      owner: WALLET,
      mint: JSOL,
      tokenProgram: TOKEN_PROGRAM_ADDRESS
    });
    accounts.clear();
    accounts.set(POOL, {
      owner: PROGRAMS.stakePool,
      data: [jpoolStakePoolFixture.data, "base64"]
    });
    accounts.set(VOTE, {
      owner: "Vote111111111111111111111111111111111111111",
      data: ["", "base64"]
    });
    rpcState.epoch = decodeStakePoolAccount(poolBytes).lastUpdateEpoch;
    rpcState.simulation = { err: null, unitsConsumed: BigInt(40_000) };
    rpcState.failAccountReads = false;
    rpcState.blockhash = getAddressDecoder().decode(new Uint8Array(32).fill(9));
    getPriorityFeeEstimateMock
      .mockReset()
      .mockResolvedValue({ priorityFeeEstimate: 1234.2 });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("builds the one-signer envelope with ATA creation and a plain memo", async () => {
    const response = await POST(request(validBody));
    expect(response.status).toBe(200);
    const body = await response.json();
    const tx = decodeTransaction(body.transaction);

    expect(tx.message.version).toBe("legacy");
    expect(tx.signers).toEqual([WALLET]);
    expect(tx.message.staticAccounts[0]).toBe(WALLET);
    expect(tx.instructions.map((ix) => ix.program)).toEqual([
      PROGRAMS.computeBudget,
      PROGRAMS.computeBudget,
      PROGRAMS.ata,
      PROGRAMS.stakePool,
      PROGRAMS.memo
    ]);

    const [limit, price, ata, deposit, memo] = tx.instructions;
    expect(limit.data[0]).toBe(2);
    expect(new DataView(limit.data.buffer, limit.data.byteOffset).getUint32(1, true)).toBe(43_000);
    expect(price.data[0]).toBe(3);
    expect(
      new DataView(price.data.buffer, price.data.byteOffset).getBigUint64(1, true)
    ).toBe(BigInt(1_235));
    expect(Array.from(ata.data)).toEqual([1]);
    expect(ata.accounts.slice(0, 4)).toEqual([WALLET, jsolAta, WALLET, JSOL]);
    expect(deposit.data[0]).toBe(14);
    expect(
      new DataView(deposit.data.buffer, deposit.data.byteOffset).getBigUint64(1, true)
    ).toBe(BigInt(10_000_000));
    expect(deposit.accounts[0]).toBe(POOL);
    expect(deposit.accounts[3]).toBe(WALLET);
    expect(deposit.accounts[4]).toBe(jsolAta);
    expect(deposit.accounts[7]).toBe(JSOL);
    expect(memo.accounts).toEqual([]);
    expect(new TextDecoder().decode(memo.data)).toBe(`direct:${VOTE}`);
    expect(BigInt(body.quote.expectedJsol)).toBeGreaterThan(BigInt(0));
  });

  it("omits ATA creation when the JSOL account already exists", async () => {
    accounts.set(jsolAta, tokenAccount(JSOL, WALLET));
    const response = await POST(request(validBody));
    const tx = decodeTransaction((await response.json()).transaction);
    expect(tx.instructions.map((ix) => ix.program)).toEqual([
      PROGRAMS.computeBudget,
      PROGRAMS.computeBudget,
      PROGRAMS.stakePool,
      PROGRAMS.memo
    ]);
  });

  it("falls back to the default priority fee without changing the envelope", async () => {
    getPriorityFeeEstimateMock.mockRejectedValue(new Error("unsupported"));
    const response = await POST(request(validBody));
    expect(response.status).toBe(200);
    const tx = decodeTransaction((await response.json()).transaction);
    expect(tx.instructions).toHaveLength(5);
  });

  it("rejects an existing ATA with unexpected mint or owner", async () => {
    accounts.set(jsolAta, tokenAccount(JSOL, address(POOL)));
    const response = await POST(request(validBody));
    expect(response.status).toBe(500);
    expect((await response.json()).code).toBe("JPOOL_POOL_INVALID");
  });

  it("is mainnet only", async () => {
    const response = await POST(
      request(
        validBody,
        "http://localhost/api/jpool/stake/generate?network=devnet"
      )
    );
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("JPOOL_MAINNET_ONLY");
  });

  it.each([
    [new Error("bad json"), "INVALID_REQUEST"],
    [[], "INVALID_REQUEST"],
    [{ ...validBody, wallet: "nope" }, "INVALID_WALLET"],
    [{ ...validBody, voteAccount: undefined }, "INVALID_VOTE_ACCOUNT"],
    [{ ...validBody, stakeLamports: 10_000_000 }, "INVALID_STAKE_LAMPORTS"],
    [{ ...validBody, stakeLamports: "0.5" }, "INVALID_STAKE_LAMPORTS"]
  ])("returns 400 for invalid input %#", async (body, code) => {
    const response = await POST(request(body));
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe(code);
  });

  it("rejects a vote account not owned by the Vote program", async () => {
    accounts.set(VOTE, { owner: TOKEN_PROGRAM_ADDRESS, data: ["", "base64"] });
    const response = await POST(request(validBody));
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("INVALID_VOTE_ACCOUNT");
  });

  it("reports an out-of-date pool before simulating", async () => {
    rpcState.epoch += BigInt(1);
    const response = await POST(request(validBody));
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe("JPOOL_POOL_UPDATING");
  });

  it("refuses to build when a SOL deposit authority is configured", async () => {
    const restricted = new Uint8Array(poolBytes);
    // In the captured layout every earlier option is None, so the
    // sol_deposit_authority tag sits at 383.
    restricted[383] = 1;
    restricted.set(getAddressEncoder().encode(WALLET), 384);
    accounts.set(POOL, {
      owner: PROGRAMS.stakePool,
      data: [getBase64Decoder().decode(restricted), "base64"]
    });
    const response = await POST(request(validBody));
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe("JPOOL_DEPOSITS_RESTRICTED");
  });

  it("maps simulation failures on the DepositSol instruction", async () => {
    rpcState.simulation = {
      err: { InstructionError: [1, { Custom: 17 }] },
      unitsConsumed: null
    };
    const response = await POST(request(validBody));
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe("JPOOL_POOL_UPDATING");
  });

  it("returns raw details for unmapped simulation failures", async () => {
    rpcState.simulation = {
      err: { InstructionError: [1, { Custom: 99 }] },
      unitsConsumed: null
    };
    const response = await POST(request(validBody));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: "JPOOL_SIMULATION_FAILED",
      details: { err: { InstructionError: [1, { Custom: 99 }] } }
    });
  });

  it("rejects deposits the program would mint zero tokens for", async () => {
    const response = await POST(request({ ...validBody, stakeLamports: "1" }));
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("JPOOL_DEPOSIT_TOO_SMALL");
  });

  it("reports RPC failures as unavailable", async () => {
    rpcState.failAccountReads = true;
    const response = await POST(request(validBody));
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe("JPOOL_RPC_UNAVAILABLE");
  });
});
