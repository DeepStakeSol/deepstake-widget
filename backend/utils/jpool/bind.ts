import { isAddress } from "@solana/kit";

import { isRecord, JPOOL_DIRECT_STAKE_API } from "./api";

export const JPOOL_BIND_URL = `${JPOOL_DIRECT_STAKE_API}/wallet-binding/bind`;
export const JPOOL_BIND_TIMEOUT_MS = 10_000;
export const MAX_BIND_RESPONSE_BYTES = 16 * 1024;

// Upstream answers observed live (TEMP-06, backend/test/fixtures/jpool-bind.json):
// 201 bound; 409 "Wallet already has a binding" with boundTo for any existing
// binding (JPool never overwrites one, C-03); 401 expired or bad signature.
export type BindOutcome =
  | { kind: "bound" }
  | { kind: "already_bound" }
  | { kind: "bound_elsewhere"; boundTo: string }
  | { kind: "expired" }
  | { kind: "rejected"; status: number }
  | { kind: "unavailable"; reason: string };

class OversizeError extends Error {}

async function readBoundedText(response: Response): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BIND_RESPONSE_BYTES) {
    throw new OversizeError();
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BIND_RESPONSE_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new OversizeError();
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function boundToVoteId(body: unknown): string | null {
  if (!isRecord(body) || !isRecord(body.boundTo)) return null;
  const voteId = body.boundTo.voteId;
  return typeof voteId === "string" && isAddress(voteId) ? voteId : null;
}

// Forwards the exact signed message. Only the content type is sent: no client
// headers, cookies or Origin are passed through.
export async function forwardBind(
  request: { signature: string; message: string; voteId: string },
  fetchImpl: typeof fetch = fetch
): Promise<BindOutcome> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), JPOOL_BIND_TIMEOUT_MS);
  try {
    let response: Response;
    try {
      response = await fetchImpl(JPOOL_BIND_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          signature: request.signature,
          message: request.message
        }),
        signal: controller.signal
      });
    } catch {
      return {
        kind: "unavailable",
        reason: controller.signal.aborted ? "timeout" : "network"
      };
    }

    let text: string;
    try {
      text = await readBoundedText(response);
    } catch (error) {
      return {
        kind: "unavailable",
        reason:
          error instanceof OversizeError
            ? "oversize"
            : controller.signal.aborted
              ? "timeout"
              : "network"
      };
    }

    const status = response.status;
    // Any 2xx is JPool accepting the binding, whatever the body says.
    if (status >= 200 && status < 300) return { kind: "bound" };
    if (status >= 500) return { kind: "unavailable", reason: `http_${status}` };

    const body = parseJson(text);
    if (status === 409) {
      const boundTo = boundToVoteId(body);
      if (!boundTo) return { kind: "rejected", status };
      return boundTo === request.voteId
        ? { kind: "already_bound" }
        : { kind: "bound_elsewhere", boundTo };
    }
    if (
      status === 401 &&
      isRecord(body) &&
      typeof body.message === "string" &&
      /expired/i.test(body.message)
    ) {
      return { kind: "expired" };
    }
    if (status >= 400) return { kind: "rejected", status };
    return { kind: "unavailable", reason: `http_${status}` };
  } finally {
    clearTimeout(timeout);
  }
}
