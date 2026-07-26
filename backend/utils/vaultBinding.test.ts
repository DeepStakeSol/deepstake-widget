import { address, getAddressEncoder, type Address } from "@solana/kit";
import { describe, expect, it, vi } from "vitest";

import { DIRECTED_STAKE_PROGRAM_ADDRESS } from "./solana/vault/instructions";
import { getVaultBinding } from "./vaultBinding";

const WALLET = "11111111111111111111111111111111";
const TARGET = address("Vote111111111111111111111111111111111111111");

function encodedDirector(stakeTarget: Address = TARGET) {
  const bytes = new Uint8Array(48);
  bytes.set(getAddressEncoder().encode(stakeTarget), 8);
  return [Buffer.from(bytes).toString("base64"), "base64"] as const;
}

function rpcWith(value: unknown) {
  return {
    getAccountInfo: vi.fn(() => ({
      send: vi.fn().mockResolvedValue({ value })
    }))
  } as never;
}

describe("getVaultBinding", () => {
  it("returns the decoded validator binding", async () => {
    await expect(
      getVaultBinding(
        WALLET,
        rpcWith({
          owner: DIRECTED_STAKE_PROGRAM_ADDRESS,
          data: encodedDirector()
        })
      )
    ).resolves.toEqual({ hasBinding: true, stakeTarget: TARGET });
  });

  it("treats missing, wrong-owner, zero, and malformed accounts as unbound", async () => {
    await expect(getVaultBinding(WALLET, rpcWith(null))).resolves.toEqual({
      hasBinding: false
    });
    await expect(
      getVaultBinding(
        WALLET,
        rpcWith({ owner: address(WALLET), data: encodedDirector() })
      )
    ).resolves.toEqual({ hasBinding: false });
    await expect(
      getVaultBinding(
        WALLET,
        rpcWith({
          owner: DIRECTED_STAKE_PROGRAM_ADDRESS,
          data: encodedDirector(address(WALLET))
        })
      )
    ).resolves.toEqual({ hasBinding: false });
    await expect(
      getVaultBinding(
        WALLET,
        rpcWith({
          owner: DIRECTED_STAKE_PROGRAM_ADDRESS,
          data: [Buffer.from([1]).toString("base64"), "base64"]
        })
      )
    ).resolves.toEqual({ hasBinding: false });
  });
});
