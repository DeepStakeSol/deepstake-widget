import { createHash, timingSafeEqual } from "node:crypto";

import { type NextRequest, NextResponse } from "next/server";

import { clientIp, consumeRateLimit } from "@/utils/rateLimit";
import { getRedisClient, isRedisConfigured } from "@/utils/redis";
import {
  runSelftest,
  SELFTEST_CHECKS,
  type SelftestCheck
} from "@/utils/selftest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A monitor calls this every 15 minutes; the limit only stops the route from
// becoming a way to load our RPC.
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;
const RATE_KEY_PREFIX = "rate-limit:v1:selftest";
const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

function tokenMatches(request: NextRequest, expected: string): boolean {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return false;

  const suppliedDigest = createHash("sha256")
    .update(authorization.slice("Bearer ".length))
    .digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(suppliedDigest, expectedDigest);
}

// Counts every attempt, authorized or not. Fails open like
// /api/transaction/send: a Redis outage must not look like a broken stake path.
async function rateLimited(request: NextRequest): Promise<number | null> {
  if (!isRedisConfigured()) return null;
  try {
    const result = await consumeRateLimit(
      await getRedisClient(),
      `${RATE_KEY_PREFIX}:ip:${clientIp(request.headers)}`,
      RATE_LIMIT,
      RATE_WINDOW_MS
    );
    return result.allowed ? null : result.retryAfterSeconds;
  } catch (error) {
    console.warn(
      "Selftest rate limit skipped:",
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

function isCheck(value: string): value is SelftestCheck {
  return (SELFTEST_CHECKS as readonly string[]).includes(value);
}

// POST /api/selftest[?check=native|jpool]
// Authorization: Bearer <SELFTEST_TOKEN>
// Builds and simulates (no signatures, nothing sent) mainnet transactions for
// SELFTEST_WALLET: a native stake at the current minimum and a JPool deposit;
// `check` runs one of them. 200 when every check passes, else 503:
// { ok, network, elapsedMs, checks: { native?, jpool? } }, each check
// { ok: true, elapsedMs, unitsConsumed, ... } or { ok: false, stage:
// "config"|"generate"|"simulate", error, elapsedMs }.
export async function POST(request: NextRequest) {
  const retryAfterSeconds = await rateLimited(request);
  if (retryAfterSeconds !== null) {
    return NextResponse.json(
      { error: "Too many requests", code: "RATE_LIMITED", retryAfterSeconds },
      {
        status: 429,
        headers: {
          ...NO_STORE_HEADERS,
          "Retry-After": String(retryAfterSeconds)
        }
      }
    );
  }

  const token = process.env.SELFTEST_TOKEN?.trim();
  if (!token) {
    return NextResponse.json(
      { error: "Selftest authentication is not configured" },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }
  if (!tokenMatches(request, token)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      {
        status: 401,
        headers: { ...NO_STORE_HEADERS, "WWW-Authenticate": "Bearer" }
      }
    );
  }

  const check = request.nextUrl.searchParams.get("check");
  if (check !== null && !isCheck(check)) {
    return NextResponse.json(
      { error: `check must be one of: ${SELFTEST_CHECKS.join(", ")}` },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const result = await runSelftest(check ? [check] : SELFTEST_CHECKS);
  for (const [name, checkResult] of Object.entries(result.checks)) {
    if (!checkResult.ok) {
      console.error(
        `Selftest ${name} failed at ${checkResult.stage} after ${checkResult.elapsedMs} ms: ${checkResult.error}`
      );
    }
  }
  return NextResponse.json(result, {
    status: result.ok ? 200 : 503,
    headers: NO_STORE_HEADERS
  });
}
