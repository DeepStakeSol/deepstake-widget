import { createHash, timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { getRedisClient } from "@/utils/redis";
import {
  getTelemetryStats,
  type TelemetryRedisClient
} from "@/utils/telemetry";

export const runtime = "nodejs";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

function tokenMatches(request: Request, expected: string): boolean {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return false;

  const suppliedDigest = createHash("sha256")
    .update(authorization.slice("Bearer ".length))
    .digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(suppliedDigest, expectedDigest);
}

export async function GET(request: Request) {
  const token = process.env.TELEMETRY_STATS_TOKEN?.trim();
  if (!token) {
    return NextResponse.json(
      { error: "Telemetry statistics authentication is not configured" },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }
  if (!tokenMatches(request, token)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      {
        status: 401,
        headers: {
          ...NO_STORE_HEADERS,
          "WWW-Authenticate": "Bearer"
        }
      }
    );
  }

  try {
    const client = (await getRedisClient()) as TelemetryRedisClient;
    const stats = await getTelemetryStats(client);
    return NextResponse.json(stats, { headers: NO_STORE_HEADERS });
  } catch {
    return NextResponse.json(
      { error: "Telemetry storage unavailable" },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }
}
