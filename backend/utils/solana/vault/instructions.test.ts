import { address, getAddressEncoder } from "@solana/kit";
import { describe, expect, it } from "vitest";

import {
  decodeDirectorStakeTarget,
  decodeDstInfoAccount
} from "./instructions";

const TARGET = address("Vote111111111111111111111111111111111111111");
const TOKEN_MINT = address("vSoLxydx6akxyMD9XEcPvGYNGq6Nn66oqVb3UkGkei7");
const VSOL_RESERVES = address("Stake11111111111111111111111111111111111111");

describe("Vault account decoders", () => {
  it("decodes the director target", () => {
    const bytes = new Uint8Array(48);
    bytes.set(getAddressEncoder().encode(TARGET), 8);
    expect(decodeDirectorStakeTarget(bytes)).toBe(TARGET);
  });

  it("decodes the DST mint and vSOL reserves", () => {
    const bytes = new Uint8Array(136);
    const encoder = getAddressEncoder();
    bytes.set(encoder.encode(TOKEN_MINT), 8);
    bytes.set(encoder.encode(VSOL_RESERVES), 104);
    expect(decodeDstInfoAccount(bytes)).toEqual({
      tokenMint: TOKEN_MINT,
      vsolReserves: VSOL_RESERVES
    });
  });

  it("rejects truncated accounts", () => {
    expect(() => decodeDirectorStakeTarget(new Uint8Array(39))).toThrow(
      "Invalid director account data"
    );
    expect(() => decodeDstInfoAccount(new Uint8Array(135))).toThrow(
      "Invalid DST account data"
    );
  });
});
