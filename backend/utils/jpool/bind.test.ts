import { afterEach, describe, expect, it, vi } from "vitest";

import fixture from "@/test/fixtures/jpool-bind.json";

import {
  forwardBind,
  JPOOL_BIND_TIMEOUT_MS,
  JPOOL_BIND_URL,
  MAX_BIND_RESPONSE_BYTES
} from "./bind";

const VOTE = "DeEpSdaw8uBLQ5T2HQhDf8fBSVbm13jGqJwoSF3HTpL5";
const OTHER_VOTE = "Vote111111111111111111111111111111111111111";
const REQUEST = { signature: "c2ln", message: fixture.signedMessage, voteId: VOTE };

function respond(status: number, body: unknown, headers: Record<string, string> = {}) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return vi.fn<typeof fetch>().mockResolvedValue(new Response(text, { status, headers }));
}

afterEach(() => {
  vi.useRealTimers();
});

describe("forwardBind", () => {
  it("posts only the signature and the exact message", async () => {
    const fetchMock = respond(fixture.bound.status, fixture.bound.body);
    await forwardBind(REQUEST, fetchMock);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(JPOOL_BIND_URL);
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({ "content-type": "application/json" });
    expect(JSON.parse(String(init?.body))).toEqual({
      signature: REQUEST.signature,
      message: fixture.signedMessage
    });
  });

  it("maps the captured 201 to bound", async () => {
    await expect(
      forwardBind(REQUEST, respond(fixture.bound.status, fixture.bound.body))
    ).resolves.toEqual({ kind: "bound" });
  });

  it("treats any 2xx as accepted, whatever the body", async () => {
    await expect(forwardBind(REQUEST, respond(200, "ok"))).resolves.toEqual({ kind: "bound" });
  });

  it("maps the captured 409 for our vote to already_bound", async () => {
    await expect(
      forwardBind(REQUEST, respond(fixture.alreadyBound.status, fixture.alreadyBound.body))
    ).resolves.toEqual({ kind: "already_bound" });
  });

  it("maps a 409 for another vote to bound_elsewhere", async () => {
    const body = { ...fixture.alreadyBound.body, boundTo: { voteId: OTHER_VOTE } };
    await expect(forwardBind(REQUEST, respond(409, body))).resolves.toEqual({
      kind: "bound_elsewhere",
      boundTo: OTHER_VOTE
    });
  });

  it("maps a 409 without a readable boundTo to rejected", async () => {
    await expect(forwardBind(REQUEST, respond(409, "<html>"))).resolves.toEqual({
      kind: "rejected",
      status: 409
    });
    await expect(
      forwardBind(REQUEST, respond(409, { boundTo: { voteId: "nope" } }))
    ).resolves.toEqual({ kind: "rejected", status: 409 });
  });

  it("maps the captured 401s", async () => {
    await expect(
      forwardBind(
        REQUEST,
        respond(fixture.expiredTimestamp.status, fixture.expiredTimestamp.body)
      )
    ).resolves.toEqual({ kind: "expired" });
    await expect(
      forwardBind(REQUEST, respond(fixture.badSignature.status, fixture.badSignature.body))
    ).resolves.toEqual({ kind: "rejected", status: 401 });
  });

  it("maps other 4xx to rejected and 5xx to unavailable", async () => {
    await expect(forwardBind(REQUEST, respond(400, {}))).resolves.toEqual({
      kind: "rejected",
      status: 400
    });
    await expect(forwardBind(REQUEST, respond(502, "bad gateway"))).resolves.toEqual({
      kind: "unavailable",
      reason: "http_502"
    });
  });

  it("maps network failures to unavailable", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fetch failed"));
    await expect(forwardBind(REQUEST, fetchMock)).resolves.toEqual({
      kind: "unavailable",
      reason: "network"
    });
  });

  it("times out after 10 seconds", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        })
    );
    const result = forwardBind(REQUEST, fetchMock);
    await vi.advanceTimersByTimeAsync(JPOOL_BIND_TIMEOUT_MS);
    await expect(result).resolves.toEqual({ kind: "unavailable", reason: "timeout" });
  });

  it("refuses oversized responses, declared or streamed", async () => {
    const big = "x".repeat(MAX_BIND_RESPONSE_BYTES + 1);
    await expect(forwardBind(REQUEST, respond(409, big))).resolves.toEqual({
      kind: "unavailable",
      reason: "oversize"
    });
    await expect(
      forwardBind(REQUEST, respond(409, "{}", { "content-length": String(20 * 1024) }))
    ).resolves.toEqual({ kind: "unavailable", reason: "oversize" });
  });
});
