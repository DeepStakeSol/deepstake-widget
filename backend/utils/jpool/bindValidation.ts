import {
  address,
  getPublicKeyFromAddress,
  isAddress,
  isOffCurveAddress,
  verifySignature,
  type SignatureBytes
} from "@solana/kit";

import { JpoolRouteError } from "@/utils/solana/jpool/errors";

import { isRecord } from "./api";

// Request and message rules for POST /api/jpool/bind (issue #25). They mirror
// JPool's own checks, so a request that passes here is only refused upstream
// for binding state or JPool's own (unmeasured) timestamp window.
export const MAX_BIND_BODY_BYTES = 2_048;
export const MAX_BIND_MESSAGE_BYTES = 512;
export const BIND_MAX_AGE_MS = 5 * 60_000;
export const BIND_MAX_FUTURE_MS = 30_000;

const BIND_ACTION = "bindWallet";
// 64 bytes encode to 86 base64 characters plus "==".
const SIGNATURE_BASE64 = /^[A-Za-z0-9+/]{86}==$/;

export interface BindRequestBody {
  wallet: string;
  signature: string;
  message: string;
}

export interface BindMessage {
  voteId: string;
  timestamp: number;
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => key in value);
}

function invalidRequest(): JpoolRouteError {
  return new JpoolRouteError("INVALID_REQUEST", 400);
}

export function parseBindBody(text: string): BindRequestBody {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw invalidRequest();
  }
  if (
    !isRecord(body) ||
    !hasExactKeys(body, ["wallet", "signature", "message"]) ||
    typeof body.wallet !== "string" ||
    typeof body.signature !== "string" ||
    typeof body.message !== "string"
  ) {
    throw invalidRequest();
  }
  // JPool verifies an Ed25519 signature by the wallet key, so a PDA can never
  // bind.
  if (!isAddress(body.wallet) || isOffCurveAddress(address(body.wallet))) {
    throw new JpoolRouteError("INVALID_WALLET", 400);
  }
  return { wallet: body.wallet, signature: body.signature, message: body.message };
}

// Canonical base64 of exactly 64 bytes, as JPool expects.
export function decodeBindSignature(signature: string): SignatureBytes {
  if (!SIGNATURE_BASE64.test(signature)) {
    throw new JpoolRouteError("INVALID_SIGNATURE", 400);
  }
  const bytes = Buffer.from(signature, "base64");
  if (bytes.length !== 64 || bytes.toString("base64") !== signature) {
    throw new JpoolRouteError("INVALID_SIGNATURE", 400);
  }
  return new Uint8Array(bytes) as SignatureBytes;
}

// The message must be exactly the compact JSON the widget signs:
// {"wallet","action","voteId","timestamp"} in that order. Any other spelling of
// the same object is refused, so the signed bytes are unambiguous.
export function parseBindMessage(
  message: string,
  wallet: string,
  now: number = Date.now()
): BindMessage {
  const invalid = () => new JpoolRouteError("INVALID_BIND_MESSAGE", 400);
  if (Buffer.byteLength(message, "utf8") > MAX_BIND_MESSAGE_BYTES) throw invalid();

  let parsed: unknown;
  try {
    parsed = JSON.parse(message);
  } catch {
    throw invalid();
  }
  if (
    !isRecord(parsed) ||
    !hasExactKeys(parsed, ["wallet", "action", "voteId", "timestamp"])
  ) {
    throw invalid();
  }
  const { action, voteId, timestamp } = parsed;
  if (
    parsed.wallet !== wallet ||
    action !== BIND_ACTION ||
    typeof voteId !== "string" ||
    typeof timestamp !== "number" ||
    !Number.isSafeInteger(timestamp)
  ) {
    throw invalid();
  }
  if (
    message !==
    JSON.stringify({ wallet, action: BIND_ACTION, voteId, timestamp })
  ) {
    throw invalid();
  }
  if (!isAddress(voteId)) {
    throw new JpoolRouteError("INVALID_VOTE_ACCOUNT", 400);
  }
  if (now - timestamp > BIND_MAX_AGE_MS || timestamp - now > BIND_MAX_FUTURE_MS) {
    throw new JpoolRouteError("JPOOL_BIND_EXPIRED", 400);
  }
  return { voteId, timestamp };
}

// Local Ed25519 check over the exact UTF-8 bytes, so JPool is never used as a
// signature oracle.
export async function verifyBindSignature(
  wallet: string,
  signature: SignatureBytes,
  message: string
): Promise<void> {
  const publicKey = await getPublicKeyFromAddress(address(wallet));
  const valid = await verifySignature(
    publicKey,
    signature,
    new TextEncoder().encode(message)
  );
  if (!valid) throw new JpoolRouteError("INVALID_SIGNATURE", 400);
}
