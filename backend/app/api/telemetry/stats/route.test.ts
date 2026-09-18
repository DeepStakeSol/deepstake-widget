import { beforeEach, describe, expect, it, vi } from "vitest";

const { getRedisClientMock, evalMock } = vi.hoisted(() => ({
  getRedisClientMock: vi.fn(),
  evalMock: vi.fn()
}));

vi.mock("@/utils/redis", () => ({ getRedisClient: getRedisClientMock }));

import { GET } from "./route";

function request(authorization?: string): Request {
  return new Request("http://localhost/api/telemetry/stats", {
    headers: authorization ? { Authorization: authorization } : undefined
  });
}

describe("GET /api/telemetry/stats", () => {
  beforeEach(() => {
    getRedisClientMock.mockReset().mockResolvedValue({ eval: evalMock });
    evalMock.mockReset().mockResolvedValue([1, 1, 1, 7, 2, 3, 30, 4, 5]);
  });

  it("fails closed when the dedicated token is unset", async () => {
    vi.stubEnv("TELEMETRY_STATS_TOKEN", "");
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(getRedisClientMock).not.toHaveBeenCalled();
  });

  it("rejects missing and invalid credentials", async () => {
    vi.stubEnv("TELEMETRY_STATS_TOKEN", "stats-secret");

    const missing = await GET(request());
    expect(missing.status).toBe(401);
    expect(missing.headers.get("www-authenticate")).toBe("Bearer");
    expect(missing.headers.get("cache-control")).toBe("no-store");

    const invalid = await GET(request("Bearer wrong"));
    expect(invalid.status).toBe(401);
    expect(getRedisClientMock).not.toHaveBeenCalled();
  });

  it("returns rolling aggregates for a valid token", async () => {
    vi.stubEnv("TELEMETRY_STATS_TOKEN", "stats-secret");
    const response = await GET(request("Bearer stats-secret"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      windows: {
        "1d": {
          deduplicated_mounts: 1,
          unique_hosts: 1,
          unique_vote_accounts: 1
        },
        "7d": { deduplicated_mounts: 7 },
        "30d": { deduplicated_mounts: 30 }
      }
    });
  });

  it("returns 503 when Redis is unavailable", async () => {
    vi.stubEnv("TELEMETRY_STATS_TOKEN", "stats-secret");
    getRedisClientMock.mockRejectedValue(new Error("redis down"));

    const response = await GET(request("Bearer stats-secret"));
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
