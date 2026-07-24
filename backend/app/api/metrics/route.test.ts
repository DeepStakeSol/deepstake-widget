import type { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import { GET } from "./route";

function request(authorization?: string): NextRequest {
  return {
    headers: new Headers(
      authorization ? { Authorization: authorization } : undefined
    )
  } as NextRequest;
}

describe("GET /api/metrics", () => {
  it("allows an unauthenticated scrape outside production", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("METRICS_BEARER_TOKEN", "");

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");
    await expect(response.text()).resolves.toContain("deepstake_process_cpu");
  });

  it("fails closed when production authentication is not configured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("METRICS_BEARER_TOKEN", "");

    const response = await GET(request());
    expect(response.status).toBe(503);
  });

  it("requires the configured bearer token", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("METRICS_BEARER_TOKEN", "metrics-secret");

    const missing = await GET(request());
    expect(missing.status).toBe(401);
    expect(missing.headers.get("www-authenticate")).toBe("Bearer");

    const invalid = await GET(request("Bearer wrong"));
    expect(invalid.status).toBe(401);

    const valid = await GET(request("Bearer metrics-secret"));
    expect(valid.status).toBe(200);
  });
});
