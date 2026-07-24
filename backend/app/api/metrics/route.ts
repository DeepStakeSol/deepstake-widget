import { timingSafeEqual } from "node:crypto";

import type { NextRequest } from "next/server";

import { validatorProfileMetrics } from "@/utils/observability/metrics";

export const runtime = "nodejs";

function tokenMatches(request: NextRequest, expected: string): boolean {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return false;

  const supplied = Buffer.from(authorization.slice("Bearer ".length));
  const configured = Buffer.from(expected);
  return (
    supplied.length === configured.length &&
    timingSafeEqual(supplied, configured)
  );
}

export async function GET(request: NextRequest) {
  const token = process.env.METRICS_BEARER_TOKEN?.trim();
  if (!token && process.env.NODE_ENV === "production") {
    return new Response("Metrics authentication is not configured\n", {
      status: 503,
      headers: { "Cache-Control": "no-store" }
    });
  }
  if (token && !tokenMatches(request, token)) {
    return new Response("Unauthorized\n", {
      status: 401,
      headers: {
        "Cache-Control": "no-store",
        "WWW-Authenticate": "Bearer"
      }
    });
  }

  return new Response(await validatorProfileMetrics.registry.metrics(), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": validatorProfileMetrics.registry.contentType
    }
  });
}
