import { address } from "@solana/kit";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { deserializeDigitalAsset } = vi.hoisted(() => ({
  deserializeDigitalAsset: vi.fn()
}));
vi.mock("@metaplex-foundation/mpl-token-metadata", () => ({
  deserializeDigitalAsset
}));

import { getMetadata } from "./metadataFetch";

const MINT = "vSoLxydx6akxyMD9XEcPvGYNGq6Nn66oqVb3UkGkei7";
const TOKEN_PROGRAM = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const METADATA_PROGRAM = address("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

function account(owner: string) {
  return {
    executable: false,
    lamports: BigInt(10),
    owner,
    data: [Buffer.from([1, 2]).toString("base64"), "base64"]
  };
}

describe("getMetadata", () => {
  beforeEach(() => {
    deserializeDigitalAsset.mockReset().mockReturnValue({
      publicKey: MINT,
      mint: { publicKey: MINT },
      metadata: { uri: "https://metadata.example/token.json" }
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ json: () => ({ image: "https://image" }) })
    );
  });

  it("fetches accounts with Kit and preserves the digital-asset response", async () => {
    const send = vi.fn().mockResolvedValue({
      value: [account(TOKEN_PROGRAM), account(METADATA_PROGRAM)]
    });
    const getMultipleAccounts = vi.fn(() => ({ send }));
    const result = await getMetadata(MINT, { getMultipleAccounts } as never);

    expect(result).toEqual({
      publicKey: MINT,
      mint: { publicKey: MINT },
      metadata: { uri: "https://metadata.example/token.json" },
      imageUrl: "https://image"
    });
    expect(deserializeDigitalAsset).toHaveBeenCalledTimes(1);
    expect(getMultipleAccounts).toHaveBeenCalledWith(
      expect.arrayContaining([MINT]),
      { commitment: "confirmed", encoding: "base64" }
    );
  });

  it("returns undefined for missing or malformed metadata", async () => {
    const missingRpc = {
      getMultipleAccounts: vi.fn(() => ({
        send: vi
          .fn()
          .mockResolvedValue({ value: [account(TOKEN_PROGRAM), null] })
      }))
    } as never;
    await expect(getMetadata(MINT, missingRpc)).resolves.toBeUndefined();

    deserializeDigitalAsset.mockImplementation(() => {
      throw new Error("bad metadata");
    });
    const malformedRpc = {
      getMultipleAccounts: vi.fn(() => ({
        send: vi.fn().mockResolvedValue({
          value: [account(TOKEN_PROGRAM), account(METADATA_PROGRAM)]
        })
      }))
    } as never;
    await expect(getMetadata(MINT, malformedRpc)).resolves.toBeUndefined();
  });
});
