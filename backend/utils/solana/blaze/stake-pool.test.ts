import {
  address,
  createNoopSigner,
  getAddressEncoder,
  getBase64Encoder
} from "@solana/kit";
import { describe, expect, it } from "vitest";

import jpoolStakePoolFixture from "@/test/fixtures/jpool-stake-pool.json";

import {
  decodeBlazeStakePoolAccount,
  decodeStakePoolAccount,
  decodeStakePoolSolDepositConfig,
  getCreateAssociatedTokenAccountIdempotentInstruction,
  getCreateAssociatedTokenAccountInstruction,
  getPlainMemoInstruction,
  MEMO_PROGRAM_ADDRESS
} from "./stake-pool";

const RESERVE_STAKE = address("Stake11111111111111111111111111111111111111");
const POOL_MINT = address("bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1");
const MANAGER_FEE = address("Vote111111111111111111111111111111111111111");
const TOKEN_PROGRAM = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

function stakePoolAccountBytes() {
  const bytes = new Uint8Array(282);
  const addressEncoder = getAddressEncoder();
  bytes[0] = 1;
  bytes.set(addressEncoder.encode(RESERVE_STAKE), 130);
  bytes.set(addressEncoder.encode(POOL_MINT), 162);
  bytes.set(addressEncoder.encode(MANAGER_FEE), 194);
  bytes.set(addressEncoder.encode(TOKEN_PROGRAM), 226);
  new DataView(bytes.buffer).setBigUint64(258, BigInt(1_000), true);
  new DataView(bytes.buffer).setBigUint64(266, BigInt(500), true);
  new DataView(bytes.buffer).setBigUint64(274, BigInt(42), true);
  return bytes;
}

describe("Blaze stake pool account decoder", () => {
  it("decodes the fixed fields needed to build DepositSol", () => {
    expect(decodeBlazeStakePoolAccount(stakePoolAccountBytes())).toEqual({
      reserveStake: RESERVE_STAKE,
      poolMint: POOL_MINT,
      managerFeeAccount: MANAGER_FEE,
      tokenProgram: TOKEN_PROGRAM,
      lastUpdateEpoch: BigInt(42)
    });
  });

  it("decodes pool balances needed for Vault conversion", () => {
    expect(decodeStakePoolAccount(stakePoolAccountBytes())).toMatchObject({
      totalLamports: BigInt(1_000),
      poolTokenSupply: BigInt(500)
    });
  });

  it("rejects short or non-stake-pool account data", () => {
    expect(() => decodeBlazeStakePoolAccount(new Uint8Array(10))).toThrow(
      "Invalid stake pool account data"
    );

    const bytes = stakePoolAccountBytes();
    bytes[0] = 0;
    expect(() => decodeBlazeStakePoolAccount(bytes)).toThrow(
      "Invalid stake pool account type"
    );
  });
});

describe("Stake pool SOL deposit config decoder", () => {
  const AUTHORITY = address("Vote111111111111111111111111111111111111111");

  function fee(bytes: number[], denominator: number, numerator: number) {
    const chunk = new Uint8Array(16);
    new DataView(chunk.buffer).setBigUint64(0, BigInt(denominator), true);
    new DataView(chunk.buffer).setBigUint64(8, BigInt(numerator), true);
    bytes.push(...chunk);
  }

  // Borsh tail after lastUpdateEpoch, padded like an on-chain account.
  function accountWithTail({
    nextEpochFee = false,
    preferredDeposit = false,
    solDepositAuthority = false,
    solDepositFee = [0, 0] as [number, number]
  } = {}) {
    const tail: number[] = [...new Uint8Array(48)];
    fee(tail, 100, 7); // epoch fee
    if (nextEpochFee) {
      tail.push(2);
      fee(tail, 100, 8);
    } else {
      tail.push(0);
    }
    if (preferredDeposit) {
      tail.push(1, ...getAddressEncoder().encode(AUTHORITY));
    } else {
      tail.push(0);
    }
    tail.push(0); // preferred withdraw
    fee(tail, 0, 0); // stake deposit fee
    fee(tail, 64_000, 243); // stake withdrawal fee
    tail.push(0); // next stake withdrawal fee
    tail.push(0); // stake referral fee
    if (solDepositAuthority) {
      tail.push(1, ...getAddressEncoder().encode(AUTHORITY));
    } else {
      tail.push(0);
    }
    fee(tail, solDepositFee[0], solDepositFee[1]);

    const bytes = new Uint8Array(611);
    bytes.set(stakePoolAccountBytes());
    bytes.set(tail, 282);
    return bytes;
  }

  it("reads the fee after variable-length fields instead of a fixed offset", () => {
    expect(
      decodeStakePoolSolDepositConfig(
        accountWithTail({ solDepositFee: [10_000, 8] })
      )
    ).toEqual({
      solDepositAuthority: null,
      solDepositFee: { denominator: BigInt(10_000), numerator: BigInt(8) }
    });

    expect(
      decodeStakePoolSolDepositConfig(
        accountWithTail({
          nextEpochFee: true,
          preferredDeposit: true,
          solDepositFee: [1_000, 3]
        })
      ).solDepositFee
    ).toEqual({ denominator: BigInt(1_000), numerator: BigInt(3) });
  });

  it("decodes a configured SOL deposit authority", () => {
    expect(
      decodeStakePoolSolDepositConfig(
        accountWithTail({ solDepositAuthority: true })
      ).solDepositAuthority
    ).toBe(AUTHORITY);
  });

  it("rejects malformed option tags and truncated data", () => {
    const bytes = accountWithTail();
    bytes[282 + 48 + 16 + 1] = 7; // preferred deposit option tag
    expect(() => decodeStakePoolSolDepositConfig(bytes)).toThrow(
      "Invalid stake pool option tag"
    );
    expect(() =>
      decodeStakePoolSolDepositConfig(stakePoolAccountBytes())
    ).toThrow("Invalid stake pool account data");
  });

  it("decodes the captured JPool account without touching Blaze fields", () => {
    const bytes = new Uint8Array(
      getBase64Encoder().encode(jpoolStakePoolFixture.data)
    );
    const config = decodeStakePoolSolDepositConfig(bytes);
    expect(config.solDepositAuthority).toBeNull();
    expect(config.solDepositFee.denominator).toBeGreaterThanOrEqual(
      config.solDepositFee.numerator
    );
    expect(decodeStakePoolAccount(bytes).poolMint).toBe(
      "7Q2afV64in6N6SeZsAAB81TJzwDoD6zpqmHkzi9Dcavn"
    );
    expect(Object.keys(decodeBlazeStakePoolAccount(bytes)).sort()).toEqual([
      "lastUpdateEpoch",
      "managerFeeAccount",
      "poolMint",
      "reserveStake",
      "tokenProgram"
    ]);
  });
});

describe("JPool instruction helpers", () => {
  const payer = createNoopSigner(
    address("Vote111111111111111111111111111111111111111")
  );
  const input = {
    payer,
    ata: RESERVE_STAKE,
    owner: payer.address,
    mint: POOL_MINT
  };

  it("builds CreateIdempotent without changing the legacy Create helper", () => {
    const legacy = getCreateAssociatedTokenAccountInstruction(input);
    const idempotent =
      getCreateAssociatedTokenAccountIdempotentInstruction(input);

    expect(legacy.data).toEqual(new Uint8Array());
    expect(idempotent.data).toEqual(new Uint8Array([1]));
    expect(idempotent.accounts).toEqual(legacy.accounts);
    expect(idempotent.programAddress).toBe(legacy.programAddress);
  });

  it("builds a plain memo without account metas", () => {
    const memo = getPlainMemoInstruction(
      "direct:DeEpSdaw8uBLQ5T2HQhDf8fBSVbm13jGqJwoSF3HTpL5"
    );
    expect(memo.programAddress).toBe(MEMO_PROGRAM_ADDRESS);
    expect(memo.accounts).toEqual([]);
    expect(memo.data).toHaveLength(51);
    expect(new TextDecoder().decode(memo.data)).toBe(
      "direct:DeEpSdaw8uBLQ5T2HQhDf8fBSVbm13jGqJwoSF3HTpL5"
    );
  });
});
