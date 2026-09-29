import type { Rpc, SolanaRpcApi } from "@solana/kit";

import { getRedisClient, isRedisConfigured } from "@/utils/redis";
import { createRpcConnection, getRpcEndpoint } from "@/utils/solana/rpc";

import { fetchJpoolJson, isRecord, JpoolApiError } from "./api";

// Validator eligibility for the JPool tab (spec §1.5, J1.3). JPool's own UI
// reads the same host. The tab is hidden only on hard blockers; every failure
// fails open, because the memo deposit path does not depend on this API.
export const JPOOL_SCORES_API = "https://api.validators.svt.one/jpool-scores";
export const JPOOL_SCORES_TIMEOUT_MS = 1_500;
// The widget gives up after 2 s, so the epoch read gets a short budget of its
// own; it is almost always served from the in-process cache.
export const EPOCH_RPC_TIMEOUT_MS = 1_000;
export const EPOCH_CACHE_TTL_MS = 60_000;
// Bounded rather than "until the epoch ends": a flag flipped by JPool
// mid-epoch is picked up within this window.
export const ELIGIBILITY_RESULT_TTL_MS = 6 * 60 * 60_000;
export const ELIGIBILITY_FALLBACK_TTL_MS = 10 * 60_000;

const CACHE_PREFIX = "jpool:v1:eligibility";

export type JpoolEligibilityReason = "blocked" | "superminority" | "not_member";

export interface JpoolEligibility {
  eligible: boolean;
  reason: JpoolEligibilityReason | null;
  epoch: number | null;
  source: "jpool" | "fallback";
}

// The facts the rule reads; cached instead of the decision so a change of
// JPOOL_ELIGIBILITY_REQUIRE_MEMBERSHIP applies without a cache flush.
export interface JpoolValidatorScore {
  epoch: number;
  isBlocked: boolean;
  isSuperMinority: boolean;
  // Only read when membership is required; null when absent or not boolean.
  isJpoolValidator: boolean | null;
}

// TEMP(JPOOL-TMP-01): JPool offers direct staking to validators outside the
// pool, so membership is not required unless the operator opts in.
export function isMembershipRequired(): boolean {
  return process.env.JPOOL_ELIGIBILITY_REQUIRE_MEMBERSHIP === "true";
}

// Picks the row for exactly this vote and epoch. Anything else (no rows,
// another vote or epoch, missing flags) is not a verdict and falls back.
export function parseJpoolScore(
  body: unknown,
  voteAccount: string,
  epoch: number
): JpoolValidatorScore {
  if (!isRecord(body) || !Array.isArray(body.data)) {
    throw new JpoolApiError("malformed", "Unexpected jpool-scores shape");
  }
  if (body.data.length === 0) {
    throw new JpoolApiError("empty", `No jpool-scores rows for epoch ${epoch}`);
  }
  const row = body.data.find(
    (item): item is Record<string, unknown> =>
      isRecord(item) &&
      item.voteId === voteAccount &&
      Number(item.epoch) === epoch
  );
  if (!row) {
    throw new JpoolApiError(
      "malformed",
      "No jpool-scores row for this vote and epoch"
    );
  }
  if (
    typeof row.isBlocked !== "boolean" ||
    typeof row.isSuperMinority !== "boolean"
  ) {
    throw new JpoolApiError(
      "malformed",
      "jpool-scores row without blocker flags"
    );
  }
  return {
    epoch,
    isBlocked: row.isBlocked,
    isSuperMinority: row.isSuperMinority,
    isJpoolValidator:
      typeof row.isJpoolValidator === "boolean" ? row.isJpoolValidator : null
  };
}

export async function fetchJpoolScore(
  epoch: number,
  voteAccount: string,
  fetchImpl: typeof fetch = fetch
): Promise<JpoolValidatorScore> {
  const url = `${JPOOL_SCORES_API}/${epoch}/${encodeURIComponent(voteAccount)}`;
  return parseJpoolScore(
    await fetchJpoolJson(url, JPOOL_SCORES_TIMEOUT_MS, fetchImpl),
    voteAccount,
    epoch
  );
}

// Commission (`isValidCommission`) is deliberately not part of the rule.
export function decideEligibility(
  score: JpoolValidatorScore,
  requireMembership: boolean
): JpoolEligibility {
  let reason: JpoolEligibilityReason | null = null;
  if (score.isBlocked) reason = "blocked";
  else if (score.isSuperMinority) reason = "superminority";
  // Unknown membership fails open like every other unknown.
  else if (requireMembership && score.isJpoolValidator === false) {
    reason = "not_member";
  }
  return {
    eligible: reason === null,
    reason,
    epoch: score.epoch,
    source: "jpool"
  };
}

export function fallbackEligibility(epoch: number | null): JpoolEligibility {
  return { eligible: true, reason: null, epoch, source: "fallback" };
}

const epochCache = new Map<string, { epoch: number; expiresAt: number }>();

export function resetEpochCacheForTests() {
  epochCache.clear();
}

// Current epoch, cached in-process for 60 s. Null when RPC is unavailable.
export async function getCurrentEpoch(
  network: string,
  rpcFactory: (network: string) => Rpc<SolanaRpcApi> = createRpcConnection
): Promise<number | null> {
  const cached = epochCache.get(network);
  if (cached && cached.expiresAt > Date.now()) return cached.epoch;
  try {
    if (!getRpcEndpoint(network)) return null;
    const { epoch } = await rpcFactory(network)
      .getEpochInfo({ commitment: "confirmed" })
      .send({ abortSignal: AbortSignal.timeout(EPOCH_RPC_TIMEOUT_MS) });
    const value = Number(epoch);
    epochCache.set(network, {
      epoch: value,
      expiresAt: Date.now() + EPOCH_CACHE_TTL_MS
    });
    return value;
  } catch (error) {
    console.warn("JPool eligibility epoch unavailable", {
      network,
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

export function eligibilityResultKey(
  network: string,
  epoch: number,
  vote: string
) {
  return `${CACHE_PREFIX}:result:${network}:${epoch}:${vote}`;
}

export function eligibilityFallbackKey(
  network: string,
  epoch: number | null,
  vote: string
) {
  return `${CACHE_PREFIX}:fallback:${network}:${epoch ?? "unknown"}:${vote}`;
}

// Redis is optional here: without it every call goes upstream.
async function readCache<T>(key: string): Promise<T | null> {
  if (!isRedisConfigured()) return null;
  try {
    const value = await (await getRedisClient()).get(key);
    return value ? (JSON.parse(value) as T) : null;
  } catch {
    return null;
  }
}

async function writeCache(key: string, value: unknown, ttlMs: number) {
  if (!isRedisConfigured()) return;
  try {
    await (
      await getRedisClient()
    ).set(key, JSON.stringify(value), { PX: ttlMs });
  } catch {
    // Redis is optional for this read.
  }
}

export interface JpoolEligibilityDeps {
  fetchImpl?: typeof fetch;
  rpcFactory?: (network: string) => Rpc<SolanaRpcApi>;
}

// Never throws: every failure path resolves to an eligible fallback.
export async function getJpoolEligibility(
  network: string,
  voteAccount: string,
  deps: JpoolEligibilityDeps = {}
): Promise<JpoolEligibility> {
  const requireMembership = isMembershipRequired();
  const epoch = await getCurrentEpoch(network, deps.rpcFactory);
  const fallbackKey = eligibilityFallbackKey(network, epoch, voteAccount);

  if (epoch !== null) {
    const score = await readCache<JpoolValidatorScore>(
      eligibilityResultKey(network, epoch, voteAccount)
    );
    if (score) return decideEligibility(score, requireMembership);
  }
  const cachedFallback = await readCache<JpoolEligibility>(fallbackKey);
  if (cachedFallback) return fallbackEligibility(epoch);

  if (epoch !== null) {
    try {
      const score = await fetchJpoolScore(epoch, voteAccount, deps.fetchImpl);
      await writeCache(
        eligibilityResultKey(network, epoch, voteAccount),
        score,
        ELIGIBILITY_RESULT_TTL_MS
      );
      return decideEligibility(score, requireMembership);
    } catch (error) {
      console.warn("JPool eligibility fell back", {
        voteAccount,
        epoch,
        kind: error instanceof JpoolApiError ? error.kind : "unexpected",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  const fallback = fallbackEligibility(epoch);
  await writeCache(fallbackKey, fallback, ELIGIBILITY_FALLBACK_TTL_MS);
  return fallback;
}
