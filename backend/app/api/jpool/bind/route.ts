import { randomUUID } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";

import { getJpoolStakePoolAddress } from "@/utils/consts";
import { forwardBind, type BindOutcome } from "@/utils/jpool/bind";
import {
  decodeBindSignature,
  MAX_BIND_BODY_BYTES,
  parseBindBody,
  parseBindMessage,
  verifyBindSignature
} from "@/utils/jpool/bindValidation";
import { clientIp, consumeRateLimit } from "@/utils/rateLimit";
import { getRedisClient, isRedisConfigured } from "@/utils/redis";
import { JPOOL_ERROR_MESSAGES, JpoolRouteError } from "@/utils/solana/jpool/errors";
import { jpoolErrorResponse } from "@/utils/solana/jpool/response";
import { invalidateWalletData } from "@/utils/walletData/service";

export const runtime = "nodejs";

const LOG_LABEL = "JPool bind:";
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;
const RATE_KEY_PREFIX = "rate-limit:v1:jpool-bind";

class RateLimitedError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super("rate limited");
  }
}

function short(value: string): string {
  return value.length > 10 ? `${value.slice(0, 4)}…${value.slice(-4)}` : value;
}

async function readBody(request: NextRequest): Promise<string> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BIND_BODY_BYTES) {
    throw new JpoolRouteError("INVALID_REQUEST", 413);
  }
  let text: string;
  try {
    text = await request.text();
  } catch {
    throw new JpoolRouteError("INVALID_REQUEST", 400);
  }
  if (Buffer.byteLength(text, "utf8") > MAX_BIND_BODY_BYTES) {
    throw new JpoolRouteError("INVALID_REQUEST", 413);
  }
  return text;
}

// Redis is required: without the limiter the route would be an open relay to
// JPool, so it fails closed (issue #25).
async function limit(key: string): Promise<void> {
  let result;
  try {
    result = await consumeRateLimit(
      await getRedisClient(),
      `${RATE_KEY_PREFIX}:${key}`,
      RATE_LIMIT,
      RATE_WINDOW_MS
    );
  } catch {
    throw new JpoolRouteError("JPOOL_BIND_UNAVAILABLE", 503);
  }
  if (!result.allowed) throw new RateLimitedError(result.retryAfterSeconds);
}

function outcomeError(outcome: BindOutcome): JpoolRouteError | null {
  switch (outcome.kind) {
    case "bound":
    case "already_bound":
    case "bound_elsewhere":
      return null;
    case "expired":
      return new JpoolRouteError("JPOOL_BIND_EXPIRED", 400);
    case "rejected":
      return new JpoolRouteError("JPOOL_BIND_REJECTED", 422);
    case "unavailable":
      return new JpoolRouteError("JPOOL_UNAVAILABLE", 503);
    default: {
      const unknown: never = outcome;
      throw new Error(`Unknown bind outcome: ${String(unknown)}`);
    }
  }
}

// POST /api/jpool/bind?network=mainnet
// Body: { wallet, signature: "<base64 Ed25519>", message: "<exact signed JSON>" }
// Validates and verifies locally, rate-limits per IP and per wallet, then
// forwards to JPool. 200 { success, alreadyBound, voteId } when the wallet is
// bound to the requested vote; 409 JPOOL_BOUND_ELSEWHERE with boundTo when it
// is bound to another validator (JPool does not overwrite bindings).
export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  let wallet: string | null = null;
  let voteId: string | null = null;
  try {
    const network = request.nextUrl.searchParams.get("network") || "mainnet";
    if (!getJpoolStakePoolAddress(network)) {
      throw new JpoolRouteError("JPOOL_MAINNET_ONLY", 400);
    }

    const text = await readBody(request);
    if (!isRedisConfigured()) {
      throw new JpoolRouteError("JPOOL_BIND_UNAVAILABLE", 503);
    }
    // Per IP before any parsing or crypto work.
    await limit(`ip:${clientIp(request.headers)}`);

    const body = parseBindBody(text);
    wallet = body.wallet;
    const signature = decodeBindSignature(body.signature);
    voteId = parseBindMessage(body.message, body.wallet).voteId;
    await verifyBindSignature(body.wallet, signature, body.message);

    // Per wallet only after verification, so junk signatures cannot use up a
    // wallet's budget.
    await limit(`wallet:${body.wallet}`);

    const outcome = await forwardBind({
      signature: body.signature,
      message: body.message,
      voteId
    });
    if (outcome.kind === "bound_elsewhere") {
      console.warn(LOG_LABEL, requestId, outcome.kind, short(wallet), short(voteId));
    }

    const error = outcomeError(outcome);
    if (error) throw error;

    // Every accepted or conflicting answer means the cached binding may be
    // stale. Best effort: a failed invalidation does not change the answer.
    await invalidateWalletData("jpool-manage", network, wallet);

    if (outcome.kind === "bound_elsewhere") {
      return NextResponse.json(
        {
          error: JPOOL_ERROR_MESSAGES.JPOOL_BOUND_ELSEWHERE,
          code: "JPOOL_BOUND_ELSEWHERE",
          boundTo: { voteId: outcome.boundTo }
        },
        { status: 409 }
      );
    }
    return NextResponse.json({
      success: true,
      alreadyBound: outcome.kind === "already_bound",
      voteId
    });
  } catch (error) {
    if (error instanceof RateLimitedError) {
      console.warn(LOG_LABEL, requestId, "rate_limited", wallet ? short(wallet) : null);
      return NextResponse.json(
        {
          error: JPOOL_ERROR_MESSAGES.JPOOL_RATE_LIMITED,
          code: "JPOOL_RATE_LIMITED",
          retryAfterSeconds: error.retryAfterSeconds
        },
        {
          status: 429,
          headers: { "Retry-After": String(error.retryAfterSeconds) }
        }
      );
    }
    if (error instanceof JpoolRouteError) {
      // Codes and shortened addresses only; never the message or signature.
      console.warn(
        LOG_LABEL,
        requestId,
        error.code,
        wallet ? short(wallet) : null,
        voteId ? short(voteId) : null
      );
      return jpoolErrorResponse(error, LOG_LABEL, "JPOOL_BIND_FAILED");
    }
    console.error(LOG_LABEL, requestId, "unexpected", error instanceof Error ? error.message : "");
    return jpoolErrorResponse(null, LOG_LABEL, "JPOOL_BIND_FAILED");
  }
}
