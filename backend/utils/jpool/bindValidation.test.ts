import {
  generateKeyPair,
  getAddressFromPublicKey,
  signBytes
} from "@solana/kit";
import { beforeAll, describe, expect, it } from "vitest";

import { JpoolRouteError } from "@/utils/solana/jpool/errors";

import {
  BIND_MAX_AGE_MS,
  BIND_MAX_FUTURE_MS,
  decodeBindSignature,
  parseBindBody,
  parseBindMessage,
  verifyBindSignature
} from "./bindValidation";

const VOTE = "DeEpSdaw8uBLQ5T2HQhDf8fBSVbm13jGqJwoSF3HTpL5";
// JPool's withdraw authority: a PDA of the stake pool program (off-curve).
const PDA = "HbJTxftxnXgpePCshA8FubsRj9MW4kfPscfuUfn44fnt";
const NOW = 1_790_956_418_243;

let keyPair: CryptoKeyPair;
let wallet: string;

function message(fields: Record<string, unknown> = {}) {
  return JSON.stringify({
    wallet,
    action: "bindWallet",
    voteId: VOTE,
    timestamp: NOW,
    ...fields
  });
}

async function sign(text: string): Promise<string> {
  const bytes = await signBytes(keyPair.privateKey, new TextEncoder().encode(text));
  return Buffer.from(bytes).toString("base64");
}

function code(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (error) {
    return error instanceof JpoolRouteError ? error.code : "other";
  }
}

beforeAll(async () => {
  keyPair = await generateKeyPair();
  wallet = await getAddressFromPublicKey(keyPair.publicKey);
});

describe("parseBindBody", () => {
  it("accepts exactly wallet, signature and message", () => {
    const body = { wallet, signature: "s", message: "m" };
    expect(parseBindBody(JSON.stringify(body))).toEqual(body);
  });

  it.each([
    ["not JSON", "{"],
    ["an array", "[]"],
    ["a missing key", JSON.stringify({ wallet: "x", signature: "s" })],
    ["an extra key", JSON.stringify({ wallet: "x", signature: "s", message: "m", vote: "v" })],
    ["a non-string field", JSON.stringify({ wallet: "x", signature: 1, message: "m" })]
  ])("rejects %s", (_name, text) => {
    expect(code(() => parseBindBody(text))).toBe("INVALID_REQUEST");
  });

  it("rejects invalid and off-curve wallets", () => {
    expect(
      code(() => parseBindBody(JSON.stringify({ wallet: "nope", signature: "s", message: "m" })))
    ).toBe("INVALID_WALLET");
    expect(
      code(() => parseBindBody(JSON.stringify({ wallet: PDA, signature: "s", message: "m" })))
    ).toBe("INVALID_WALLET");
  });
});

describe("decodeBindSignature", () => {
  it("decodes canonical base64 of 64 bytes", () => {
    const signature = Buffer.alloc(64, 7).toString("base64");
    expect(decodeBindSignature(signature)).toHaveLength(64);
  });

  it.each([
    ["63 bytes", Buffer.alloc(63, 7).toString("base64")],
    ["65 bytes", Buffer.alloc(65, 7).toString("base64")],
    ["url-safe alphabet", Buffer.alloc(64, 0xff).toString("base64url") + "=="],
    ["missing padding", Buffer.alloc(64, 7).toString("base64").slice(0, 86)],
    // Non-zero trailing bits decode to the same bytes but are not canonical.
    ["non-canonical tail", Buffer.alloc(64, 7).toString("base64").slice(0, 85) + "x=="]
  ])("rejects %s", (_name, signature) => {
    expect(code(() => decodeBindSignature(signature))).toBe("INVALID_SIGNATURE");
  });
});

describe("parseBindMessage", () => {
  it("accepts the compact canonical message", () => {
    expect(parseBindMessage(message(), wallet, NOW)).toEqual({ voteId: VOTE, timestamp: NOW });
  });

  it.each([
    ["pretty-printed JSON", () => JSON.stringify(JSON.parse(message()), null, 2)],
    [
      "reordered keys",
      () => JSON.stringify({ action: "bindWallet", wallet, voteId: VOTE, timestamp: NOW })
    ],
    ["an extra key", () => message({ extra: 1 })],
    ["a wrong action", () => message({ action: "unbindWallet" })],
    ["another wallet", () => message({ wallet: VOTE })],
    ["a string timestamp", () => message({ timestamp: String(NOW) })],
    ["a fractional timestamp", () => message({ timestamp: NOW + 0.5 })],
    ["not JSON", () => "bindWallet"],
    ["an oversized message", () => message({ voteId: "x".repeat(600) })]
  ])("rejects %s", (_name, build) => {
    expect(code(() => parseBindMessage(build(), wallet, NOW))).toBe("INVALID_BIND_MESSAGE");
  });

  it("rejects an invalid vote account", () => {
    expect(code(() => parseBindMessage(message({ voteId: "nope" }), wallet, NOW))).toBe(
      "INVALID_VOTE_ACCOUNT"
    );
  });

  it("enforces the timestamp window at its edges", () => {
    const at = (now: number) => code(() => parseBindMessage(message(), wallet, now));
    expect(at(NOW + BIND_MAX_AGE_MS)).toBeNull();
    expect(at(NOW + BIND_MAX_AGE_MS + 1)).toBe("JPOOL_BIND_EXPIRED");
    expect(at(NOW - BIND_MAX_FUTURE_MS)).toBeNull();
    expect(at(NOW - BIND_MAX_FUTURE_MS - 1)).toBe("JPOOL_BIND_EXPIRED");
  });
});

describe("verifyBindSignature", () => {
  it("accepts the wallet's signature over the exact bytes", async () => {
    const text = message();
    const signature = decodeBindSignature(await sign(text));
    await expect(verifyBindSignature(wallet, signature, text)).resolves.toBeUndefined();
  });

  it("rejects a signature over different bytes", async () => {
    const signature = decodeBindSignature(await sign(message()));
    await expect(
      verifyBindSignature(wallet, signature, message({ timestamp: NOW + 1 }))
    ).rejects.toMatchObject({ code: "INVALID_SIGNATURE" });
  });

  it("rejects another wallet's signature", async () => {
    const other = await generateKeyPair();
    const text = message();
    const bytes = await signBytes(other.privateKey, new TextEncoder().encode(text));
    await expect(
      verifyBindSignature(wallet, decodeBindSignature(Buffer.from(bytes).toString("base64")), text)
    ).rejects.toMatchObject({ code: "INVALID_SIGNATURE" });
  });
});
