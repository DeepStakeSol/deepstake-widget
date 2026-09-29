import { isAddress } from "@solana/kit";

// Read-only JPool direct-stake API (spec §1.3). No auth, no versioning; field
// presence and number/string encoding drift between weeks, so every field is
// parsed defensively and amounts become bigint base units.
export const JPOOL_DIRECT_STAKE_API = "https://api2.jpool.one/direct-stake";
export const JPOOL_API_TIMEOUT_MS = 5_000;

export type JpoolApiFailure =
  | "timeout"
  | "network"
  | "http"
  | "malformed"
  // A well-formed but empty answer (eligibility scores not published yet).
  | "empty";

export class JpoolApiError extends Error {
  constructor(
    public readonly kind: JpoolApiFailure,
    message: string
  ) {
    super(message);
    this.name = "JpoolApiError";
  }
}

export interface JpoolWalletBinding {
  voteId: string;
  // JSOL counted through the binding; null when the field is missing or
  // unparseable (the binding itself is still known).
  amount: bigint | null;
  updatedAt: string | null;
}

export interface JpoolDirectStakeRecord {
  id: string | null;
  voteId: string;
  poolTokenAmount: bigint | null;
  balanceAmount: bigint | null;
  // Counted amount: min(assigned, real balance).
  availableAmount: bigint;
  createdAt: string | null;
}

// Accepts a non-negative integer as a decimal string or a safe JSON number.
export function parseJpoolAmount(value: unknown): bigint | null {
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  if (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  ) {
    return BigInt(value);
  }
  return null;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// GET with a hard timeout; every failure becomes a typed JpoolApiError so
// callers can degrade per source without inspecting fetch internals.
export async function fetchJpoolJson(
  url: string,
  timeoutMs: number,
  fetchImpl: typeof fetch = fetch
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetchImpl(url, {
      signal: controller.signal,
      headers: { accept: "application/json" }
    });
  } catch (error) {
    throw controller.signal.aborted
      ? new JpoolApiError("timeout", `JPool API timed out: ${url}`)
      : new JpoolApiError(
          "network",
          error instanceof Error ? error.message : String(error)
        );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new JpoolApiError("http", `JPool API returned HTTP ${response.status}`);
  }
  try {
    return await response.json();
  } catch {
    throw new JpoolApiError("malformed", "JPool API returned invalid JSON");
  }
}

function getJson(path: string, fetchImpl: typeof fetch): Promise<unknown> {
  return fetchJpoolJson(
    `${JPOOL_DIRECT_STAKE_API}${path}`,
    JPOOL_API_TIMEOUT_MS,
    fetchImpl
  );
}

export function parseWalletBinding(body: unknown): JpoolWalletBinding | null {
  // An unbound wallet is literally `null` with HTTP 200.
  if (body === null) return null;
  if (!isRecord(body) || typeof body.voteId !== "string" || !isAddress(body.voteId)) {
    throw new JpoolApiError("malformed", "Unexpected wallet binding shape");
  }
  if (body.boundTo !== undefined && body.boundTo !== null) {
    if (!isRecord(body.boundTo) || body.boundTo.voteId !== body.voteId) {
      throw new JpoolApiError("malformed", "Wallet binding vote ids disagree");
    }
  }
  return {
    voteId: body.voteId,
    amount: parseJpoolAmount(body.amount),
    updatedAt: optionalString(body.updatedAt)
  };
}

// Only records for the requested vote account are kept.
export function parseDirectStakes(
  body: unknown,
  voteAccount: string
): JpoolDirectStakeRecord[] {
  if (body === null) return [];
  if (!Array.isArray(body)) {
    throw new JpoolApiError("malformed", "Unexpected direct stakes shape");
  }
  return body.flatMap((row): JpoolDirectStakeRecord[] => {
    if (!isRecord(row) || typeof row.voteId !== "string") {
      throw new JpoolApiError("malformed", "Unexpected direct stake record");
    }
    if (row.voteId !== voteAccount) return [];
    const availableAmount = parseJpoolAmount(row.availableAmount);
    if (availableAmount === null) {
      throw new JpoolApiError("malformed", "Direct stake without availableAmount");
    }
    return [
      {
        id:
          typeof row.id === "number" || typeof row.id === "string"
            ? String(row.id)
            : null,
        voteId: row.voteId,
        poolTokenAmount: parseJpoolAmount(row.poolTokenAmount),
        balanceAmount: parseJpoolAmount(row.balanceAmount),
        availableAmount,
        createdAt: optionalString(row.createdAt)
      }
    ];
  });
}

export async function fetchJpoolWalletBinding(
  wallet: string,
  fetchImpl: typeof fetch = fetch
): Promise<JpoolWalletBinding | null> {
  return parseWalletBinding(
    await getJson(`/wallet-binding/${encodeURIComponent(wallet)}`, fetchImpl)
  );
}

export async function fetchJpoolDirectStakes(
  wallet: string,
  voteAccount: string,
  fetchImpl: typeof fetch = fetch
): Promise<JpoolDirectStakeRecord[]> {
  const query = new URLSearchParams({ wallet, voteId: voteAccount });
  return parseDirectStakes(await getJson(`/find?${query}`, fetchImpl), voteAccount);
}
