import {
  generateKeyPair,
  getAddressFromPublicKey,
  signBytes
} from "@solana/kit";
import { NextRequest } from "next/server";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import fixture from "@/test/fixtures/jpool-bind.json";

const { redisState, evalMock, invalidateMock, fetchMock } = vi.hoisted(() => ({
  redisState: { configured: true, down: false },
  evalMock: vi.fn(),
  invalidateMock: vi.fn(),
  fetchMock: vi.fn()
}));

vi.mock("@/utils/redis", () => ({
  isRedisConfigured: () => redisState.configured,
  getRedisClient: async () => {
    if (redisState.down) throw new Error("Redis connection is in cooldown");
    return { eval: evalMock };
  }
}));
vi.mock("@/utils/walletData/service", () => ({ invalidateWalletData: invalidateMock }));

import { POST } from "./route";

const VOTE = "DeEpSdaw8uBLQ5T2HQhDf8fBSVbm13jGqJwoSF3HTpL5";
const OTHER_VOTE = "Vote111111111111111111111111111111111111111";

let keyPair: CryptoKeyPair;
let wallet: string;

async function signedBody(fields: Record<string, unknown> = {}) {
  const message = JSON.stringify({
    wallet,
    action: "bindWallet",
    voteId: VOTE,
    timestamp: Date.now(),
    ...fields
  });
  const bytes = await signBytes(keyPair.privateKey, new TextEncoder().encode(message));
  return { wallet, signature: Buffer.from(bytes).toString("base64"), message };
}

function request(body: unknown, { network = "mainnet", ip = "203.0.113.7" } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (ip) headers["x-real-ip"] = ip;
  return new NextRequest(`http://localhost/api/jpool/bind?network=${network}`, {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body)
  });
}

function upstream(status: number, body: unknown) {
  fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status }));
}

function limiterKeys(): string[] {
  return evalMock.mock.calls.map((call) => call[1].keys[0]);
}

beforeAll(async () => {
  keyPair = await generateKeyPair();
  wallet = await getAddressFromPublicKey(keyPair.publicKey);
});

beforeEach(() => {
  redisState.configured = true;
  redisState.down = false;
  evalMock.mockReset().mockResolvedValue([1, 60_000]);
  invalidateMock.mockReset().mockResolvedValue(true);
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("POST /api/jpool/bind", () => {
  it("binds, invalidates Manage and limits per IP and per wallet", async () => {
    upstream(fixture.bound.status, fixture.bound.body);
    const body = await signedBody();
    const response = await POST(request(body));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      alreadyBound: false,
      voteId: VOTE
    });
    expect(invalidateMock).toHaveBeenCalledWith("jpool-manage", "mainnet", wallet);
    expect(limiterKeys()).toEqual([
      "rate-limit:v1:jpool-bind:ip:203.0.113.7",
      `rate-limit:v1:jpool-bind:wallet:${wallet}`
    ]);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      signature: body.signature,
      message: body.message
    });
  });

  it("treats a 409 for the same vote as already bound", async () => {
    upstream(fixture.alreadyBound.status, fixture.alreadyBound.body);
    const response = await POST(request(await signedBody()));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true, alreadyBound: true });
    expect(invalidateMock).toHaveBeenCalledTimes(1);
  });

  it("returns 409 with boundTo for another vote and invalidates", async () => {
    upstream(409, { ...fixture.alreadyBound.body, boundTo: { voteId: OTHER_VOTE } });
    const response = await POST(request(await signedBody()));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "JPOOL_BOUND_ELSEWHERE",
      boundTo: { voteId: OTHER_VOTE }
    });
    expect(invalidateMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the answer when invalidation fails", async () => {
    upstream(fixture.bound.status, fixture.bound.body);
    invalidateMock.mockResolvedValue(false);
    expect((await POST(request(await signedBody()))).status).toBe(200);
  });

  it.each([
    ["expired", fixture.expiredTimestamp.status, fixture.expiredTimestamp.body, 400, "JPOOL_BIND_EXPIRED"],
    ["bad signature", fixture.badSignature.status, fixture.badSignature.body, 422, "JPOOL_BIND_REJECTED"],
    ["upstream 5xx", 503, { message: "down" }, 503, "JPOOL_UNAVAILABLE"]
  ])("maps upstream %s without invalidating", async (_name, status, body, expected, code) => {
    upstream(status, body);
    const response = await POST(request(await signedBody()));
    expect(response.status).toBe(expected);
    await expect(response.json()).resolves.toMatchObject({ code });
    expect(invalidateMock).not.toHaveBeenCalled();
  });

  it("is mainnet-only", async () => {
    const response = await POST(request(await signedBody(), { network: "devnet" }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "JPOOL_MAINNET_ONLY" });
  });

  it("refuses oversized bodies before touching Redis", async () => {
    const response = await POST(request("x".repeat(3_000)));
    expect(response.status).toBe(413);
    expect(evalMock).not.toHaveBeenCalled();
  });

  it("fails closed without Redis", async () => {
    redisState.configured = false;
    let response = await POST(request(await signedBody()));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: "JPOOL_BIND_UNAVAILABLE" });

    redisState.configured = true;
    redisState.down = true;
    response = await POST(request(await signedBody()));
    expect(response.status).toBe(503);

    redisState.down = false;
    evalMock.mockRejectedValue(new Error("eval failed"));
    response = await POST(request(await signedBody()));
    expect(response.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 429 with Retry-After when the IP limit is hit", async () => {
    evalMock.mockResolvedValue([11, 7_500]);
    const response = await POST(request(await signedBody()));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("8");
    await expect(response.json()).resolves.toMatchObject({
      code: "JPOOL_RATE_LIMITED",
      retryAfterSeconds: 8
    });
    expect(limiterKeys()).toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 429 when the wallet limit is hit", async () => {
    evalMock.mockResolvedValueOnce([1, 60_000]).mockResolvedValueOnce([11, 30_000]);
    const response = await POST(request(await signedBody()));
    expect(response.status).toBe(429);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["a malformed body", async () => "{", "INVALID_REQUEST"],
    [
      "a bad signature encoding",
      async () => ({ ...(await signedBody()), signature: "abc" }),
      "INVALID_SIGNATURE"
    ],
    [
      "a forged signature",
      async () => ({ ...(await signedBody()), signature: Buffer.alloc(64, 1).toString("base64") }),
      "INVALID_SIGNATURE"
    ],
    ["a wrong action", async () => signedBody({ action: "unbindWallet" }), "INVALID_BIND_MESSAGE"],
    ["a stale timestamp", async () => signedBody({ timestamp: Date.now() - 6 * 60_000 }), "JPOOL_BIND_EXPIRED"]
  ])("rejects %s before the wallet limit and JPool", async (_name, build, code) => {
    const response = await POST(request(await build()));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code });
    expect(limiterKeys()).toEqual(["rate-limit:v1:jpool-bind:ip:203.0.113.7"]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses one unknown bucket without X-Real-IP", async () => {
    upstream(fixture.bound.status, fixture.bound.body);
    await POST(request(await signedBody(), { ip: "" }));
    expect(limiterKeys()[0]).toBe("rate-limit:v1:jpool-bind:ip:unknown");
  });

  it("never logs the message or the signature", async () => {
    const body = await signedBody();
    for (const [status, payload] of [
      [201, fixture.bound.body],
      [401, fixture.badSignature.body],
      [500, {}]
    ] as const) {
      upstream(status, payload);
      await POST(request(body));
    }
    fetchMock.mockRejectedValue(new Error("network"));
    await POST(request(body));

    const logged = JSON.stringify(
      [console.warn, console.error].flatMap(
        (fn) => (fn as unknown as { mock: { calls: unknown[] } }).mock.calls
      )
    );
    expect(logged).not.toContain(body.signature);
    expect(logged).not.toContain(body.message);
    expect(logged).not.toContain(wallet);
  });
});
