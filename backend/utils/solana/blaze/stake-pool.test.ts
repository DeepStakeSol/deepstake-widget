import { address, getAddressEncoder } from "@solana/kit";
import { describe, expect, it } from "vitest";

import {
  decodeBlazeStakePoolAccount,
  decodeStakePoolAccount
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
