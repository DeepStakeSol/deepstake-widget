import { address, getAddressEncoder } from "@solana/kit";
import { describe, expect, it, vi } from "vitest";

import { getAllDSTs } from "./dstFetch";
import {
  findDirectorAddress,
  findDstInfoAddress
} from "./solana/vault/instructions";

const TOKEN_MINT = address("vSoLxydx6akxyMD9XEcPvGYNGq6Nn66oqVb3UkGkei7");
const OPERATOR = address("Vote111111111111111111111111111111111111111");
const PARTNER = address("11111111111111111111111111111111");
const RESERVES = address("Stake11111111111111111111111111111111111111");
const TARGET = OPERATOR;

function base64(bytes: Uint8Array) {
  return [Buffer.from(bytes).toString("base64"), "base64"] as const;
}

function dstAccountData() {
  const bytes = new Uint8Array(204);
  const encoder = getAddressEncoder();
  bytes.set(encoder.encode(TOKEN_MINT), 8);
  bytes.set(encoder.encode(OPERATOR), 40);
  bytes.set(encoder.encode(PARTNER), 72);
  bytes.set(encoder.encode(RESERVES), 104);
  const view = new DataView(bytes.buffer);
  view.setBigUint64(136, BigInt(11), true);
  view.setBigUint64(144, BigInt(12), true);
  view.setBigUint64(152, BigInt(13), true);
  view.setBigUint64(160, BigInt(14), true);
  view.setUint8(168, 7);
  view.setUint8(169, 8);
  view.setUint16(170, 9, true);
  bytes.set(encoder.encode(PARTNER), 172);
  return bytes;
}

function directorData() {
  const bytes = new Uint8Array(48);
  bytes.set(getAddressEncoder().encode(TARGET), 8);
  new DataView(bytes.buffer).setBigUint64(40, BigInt(99), true);
  return bytes;
}

describe("getAllDSTs", () => {
  it("decodes DST program accounts and their director bindings", async () => {
    const dst = await findDstInfoAddress(TOKEN_MINT);
    const director = await findDirectorAddress(dst);
    const getMultipleAccounts = vi.fn(() => ({
      send: vi.fn().mockResolvedValue({
        value: [{ data: base64(directorData()) }]
      })
    }));
    const rpc = {
      getProgramAccounts: vi.fn(() => ({
        send: vi
          .fn()
          .mockResolvedValue([
            { pubkey: dst, account: { data: base64(dstAccountData()) } }
          ])
      })),
      getMultipleAccounts
    } as never;

    await expect(getAllDSTs(rpc)).resolves.toEqual([
      {
        address: dst,
        directorAddress: director,
        data: {
          tokenMint: TOKEN_MINT,
          operator: OPERATOR,
          partner: PARTNER,
          vsolReserves: RESERVES,
          lifetimeOperatorFees: BigInt(11),
          unclaimedOperatorFees: BigInt(12),
          lifetimePartnerFees: BigInt(13),
          unclaimedPartnerFees: BigInt(14),
          bump: 7,
          baseFee: 8,
          operatorFee: 9,
          pendingOperator: PARTNER
        },
        director: { stakeTarget: TARGET, lastUpdatedAt: BigInt(99) }
      }
    ]);
    expect(getMultipleAccounts).toHaveBeenCalledWith([director], {
      commitment: "confirmed",
      encoding: "base64"
    });
  });

  it("does not issue an empty multiple-account request", async () => {
    const getMultipleAccounts = vi.fn();
    const rpc = {
      getProgramAccounts: vi.fn(() => ({
        send: vi.fn().mockResolvedValue([])
      })),
      getMultipleAccounts
    } as never;
    await expect(getAllDSTs(rpc)).resolves.toEqual([]);
    expect(getMultipleAccounts).not.toHaveBeenCalled();
  });
});
