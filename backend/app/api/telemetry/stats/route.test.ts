import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

const { getRedisClientMock, evalMock } = vi.hoisted(() => ({
  getRedisClientMock: vi.fn(),
  evalMock: vi.fn()
}));

vi.mock("@/utils/redis", () => ({ getRedisClient: getRedisClientMock }));

import { GET } from "./route";

function request(authorization?: string, detail = false): Request {
  return new Request(
    "http://localhost/api/telemetry/stats" + (detail ? "?detail=1" : ""),
    {
      headers: authorization ? { Authorization: authorization } : undefined
    }
  );
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
    await expect(response.json()).resolves.toEqual({
      windows: {
        "1d": {
          deduplicated_mounts: 1,
          unique_hosts: 1,
          unique_vote_accounts: 1,
          start_date: expect.any(String),
          end_date: expect.any(String)
        },
        "7d": {
          deduplicated_mounts: 7,
          unique_hosts: 2,
          unique_vote_accounts: 3,
          start_date: expect.any(String),
          end_date: expect.any(String)
        },
        "30d": {
          deduplicated_mounts: 30,
          unique_hosts: 4,
          unique_vote_accounts: 5,
          start_date: expect.any(String),
          end_date: expect.any(String)
        }
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

  it("protects detail=1 with the same token and returns the host fields", async () => {
    vi.stubEnv("TELEMETRY_STATS_TOKEN", "stats-secret");
    expect((await GET(request(undefined, true))).status).toBe(401);
    expect((await GET(request("Bearer wrong", true))).status).toBe(401);
    expect(getRedisClientMock).not.toHaveBeenCalled();

    const vote = "Vote111111111111111111111111111111111111111";
    const item = {
      event: "widget_mount",
      hostname: "example.org",
      vote_account: vote,
      network: "mainnet",
      tabs: ["native"],
      theme: "dark",
      version: "1.0.0"
    };
    const field = createHash("sha256")
      .update(item.hostname)
      .update("\0")
      .update(vote)
      .digest("hex");
    const days = Array.from({ length: 30 }, () => [] as string[]);
    days[0] = ["example.org"];
    evalMock
      .mockResolvedValueOnce([1, 1, 1, 7, 2, 3, 30, 4, 5])
      .mockResolvedValueOnce([
        ...days,
        [field, "2026-09-01"],
        [field, "2026-09-18"],
        [field, JSON.stringify(item)]
      ]);
    const response = await GET(request("Bearer stats-secret", true));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const data = await response.json();
    expect(data.hosts).toEqual([
      {
        hostname: "example.org",
        vote_account: vote,
        network: "mainnet",
        tabs: ["native"],
        theme: "dark",
        version: "1.0.0",
        first_seen: "2026-09-01",
        last_seen: "2026-09-18",
        is_dev: false
      }
    ]);
    expect(data.windows["1d"].unique_hosts_external).toBe(1);
  });
});
