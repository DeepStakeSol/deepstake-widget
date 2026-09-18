import { beforeEach, describe, expect, it, vi } from "vitest";

const { getRedisClientMock, evalMock } = vi.hoisted(() => ({
  getRedisClientMock: vi.fn(),
  evalMock: vi.fn()
}));

vi.mock("@/utils/redis", () => ({ getRedisClient: getRedisClientMock }));

import { POST } from "./route";
import { TELEMETRY_BODY_LIMIT_BYTES } from "@/utils/telemetry";

const validPayload = {
  event: "widget_mount",
  hostname: "validator.example",
  vote_account: "Vote111111111111111111111111111111111111111",
  network: "mainnet",
  tabs: ["native", "vault"],
  theme: "light",
  version: "1.0.0"
};

function request(
  body: string,
  contentType = "text/plain;charset=UTF-8"
): Request {
  return new Request("http://localhost/api/telemetry", {
    method: "POST",
    headers: { "Content-Type": contentType },
    body
  });
}

describe("POST /api/telemetry", () => {
  beforeEach(() => {
    evalMock.mockReset().mockResolvedValue(1);
    getRedisClientMock.mockReset().mockResolvedValue({ eval: evalMock });
  });

  it("accepts first and duplicate Beacon events", async () => {
    expect((await POST(request(JSON.stringify(validPayload)))).status).toBe(
      204
    );
    evalMock.mockResolvedValueOnce(0);
    expect((await POST(request(JSON.stringify(validPayload)))).status).toBe(
      204
    );
  });

  it("accepts an application/json payload", async () => {
    const response = await POST(
      request(JSON.stringify(validPayload), "application/json")
    );
    expect(response.status).toBe(204);
  });

  it("returns validation errors without opening Redis", async () => {
    expect((await POST(request("not-json"))).status).toBe(400);
    expect(
      (
        await POST(
          request(JSON.stringify({ ...validPayload, wallet: "forbidden" }))
        )
      ).status
    ).toBe(400);
    expect(
      (
        await POST(
          request(JSON.stringify(validPayload), "application/octet-stream")
        )
      ).status
    ).toBe(415);
    expect(
      (await POST(request("x".repeat(TELEMETRY_BODY_LIMIT_BYTES + 1)))).status
    ).toBe(413);
    expect(getRedisClientMock).not.toHaveBeenCalled();
  });

  it("returns 503 when Redis is unavailable", async () => {
    getRedisClientMock.mockRejectedValue(new Error("redis down"));
    const response = await POST(request(JSON.stringify(validPayload)));
    expect(response.status).toBe(503);
  });
});
