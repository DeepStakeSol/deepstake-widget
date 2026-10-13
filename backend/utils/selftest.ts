import { randomBytes } from "node:crypto";

import {
  address,
  getAddressDecoder,
  isAddress,
  type Address,
  type Base64EncodedWireTransaction,
  type Rpc,
  type SolanaRpcApi
} from "@solana/kit";

import { LAMPORTS_PER_SOL } from "@/utils/constants";
import { JpoolRouteError } from "@/utils/solana/jpool/errors";
import { buildJpoolDepositTransaction } from "@/utils/solana/jpool/generate";
import { createRpcConnection } from "@/utils/solana/rpc";
import {
  buildNativeStakeTransaction,
  StakeGenerateError
} from "@/utils/solana/stake/generate";
import { getStakeMinimum } from "@/utils/solana/stake/minimum";
import { withTimeout } from "@/utils/timeout";

const SELFTEST_NETWORK = "mainnet";
// Per check. Generous next to the 3 s target: a slow but working RPC must not
// page.
const SELFTEST_TIMEOUT_MS = 10_000;
const MAX_ERROR_LENGTH = 300;
// JPool has no program minimum the widget enforces; a small deposit is enough
// to exercise the pool, and SELFTEST_WALLET already holds the native minimum.
export const JPOOL_SELFTEST_LAMPORTS = 10_000_000n;

export const SELFTEST_CHECKS = ["native", "jpool"] as const;
export type SelftestCheck = (typeof SELFTEST_CHECKS)[number];
export type SelftestStage = "config" | "generate" | "simulate";

export type SelftestCheckResult =
  | ({ ok: true; elapsedMs: number } & Record<string, unknown>)
  | { ok: false; stage: SelftestStage; error: string; elapsedMs: number };

export interface SelftestResult {
  ok: boolean;
  network: string;
  elapsedMs: number;
  checks: Partial<Record<SelftestCheck, SelftestCheckResult>>;
}

class SelftestFailure extends Error {
  constructor(
    public readonly stage: SelftestStage,
    message: string
  ) {
    super(message);
  }
}

// An expected, temporary state outside our control: the check passes with
// `skipped` instead of paging.
class SelftestSkip extends Error {}

function jsonSafe(value: unknown): string {
  return JSON.stringify(value, (_key, nested) =>
    typeof nested === "bigint" ? nested.toString() : nested
  );
}

// RPC errors can echo the endpoint, which may carry an API key; the result is
// returned to the caller and logged, so strip every configured endpoint and
// any api-key parameter.
export function redactSelftestError(message: string): string {
  let redacted = message;
  for (const name of [
    "MAINNET_RPC_ENDPOINT",
    "DEVNET_RPC_ENDPOINT",
    "TESTNET_RPC_ENDPOINT"
  ]) {
    const endpoint = process.env[name]?.trim();
    if (!endpoint) continue;
    redacted = redacted.split(endpoint).join("<rpc>");
    try {
      redacted = redacted.split(new URL(endpoint).host).join("<rpc>");
    } catch {
      // Not a URL; the literal replacement above is enough.
    }
  }
  redacted = redacted.replace(/api-key=[^&\s"']+/gi, "api-key=<redacted>");
  return redacted.length > MAX_ERROR_LENGTH
    ? `${redacted.slice(0, MAX_ERROR_LENGTH)}…`
    : redacted;
}

function describeError(error: unknown): string {
  if (error instanceof StakeGenerateError) {
    // A failed compute estimate carries the transaction error as `cause`;
    // kit's message around it is generic.
    const details = error.body.details as { cause?: unknown } | undefined;
    return details?.cause
      ? `${error.body.error}: ${jsonSafe(details.cause)}`
      : error.body.error;
  }
  if (error instanceof JpoolRouteError) {
    const details = error.details as { err?: unknown } | undefined;
    return details?.err
      ? `${error.code}: ${jsonSafe(details.err)}`
      : `${error.code}: ${error.message}`;
  }
  if (!(error instanceof Error)) return String(error);
  const cause = (error as { cause?: { code?: unknown } }).cause;
  return typeof cause?.code === "string"
    ? `${error.message} (${cause.code})`
    : error.message;
}

function readConfig(): { wallet: Address; voteAccount: Address } {
  const wallet = process.env.SELFTEST_WALLET?.trim();
  if (!wallet || !isAddress(wallet)) {
    throw new SelftestFailure(
      "config",
      "SELFTEST_WALLET is not set to a valid address"
    );
  }
  // The widget takes its vote account from the embed options; the backend
  // default is only a fallback.
  const voteAccount =
    process.env.SELFTEST_VOTE_ACCOUNT?.trim() ||
    process.env.NEXT_PUBLIC_VALIDATOR_ADDRESS?.trim();
  if (!voteAccount || !isAddress(voteAccount)) {
    throw new SelftestFailure(
      "config",
      "SELFTEST_VOTE_ACCOUNT is not set to a valid address"
    );
  }
  return { wallet: address(wallet), voteAccount: address(voteAccount) };
}

// Simulates the unsigned transaction as the wallet would send it. Nothing is
// signed or sent; the server holds no key.
async function simulateUnsigned(
  rpc: Rpc<SolanaRpcApi>,
  transaction: Base64EncodedWireTransaction
): Promise<number | null> {
  const { value } = await rpc
    .simulateTransaction(transaction, {
      encoding: "base64",
      sigVerify: false,
      replaceRecentBlockhash: true,
      commitment: "confirmed"
    })
    .send();
  if (value.err) {
    const lastLog = value.logs?.at(-1);
    throw new SelftestFailure(
      "simulate",
      jsonSafe(value.err) + (lastLog ? `: ${lastLog}` : "")
    );
  }
  return value.unitsConsumed == null ? null : Number(value.unitsConsumed);
}

type SetStage = (stage: SelftestStage) => void;
type CheckBody = (
  config: { wallet: Address; voteAccount: Address },
  setStage: SetStage
) => Promise<Record<string, unknown>>;

// Native stake at the current minimum, built exactly as /api/stake/generate.
const nativeCheck: CheckBody = async ({ wallet, voteAccount }, setStage) => {
  const rpc = createRpcConnection(SELFTEST_NETWORK);
  const minimum = await getStakeMinimum(SELFTEST_NETWORK, rpc);
  const transaction = await buildNativeStakeTransaction({
    network: SELFTEST_NETWORK,
    rpc,
    stakeLamports: minimum.minimumStakeLamports,
    authority: wallet,
    // A fresh address with no key: the simulation skips signatures.
    newAccount: getAddressDecoder().decode(randomBytes(32)),
    voteAccount
  });
  setStage("simulate");
  return {
    minimumSol: minimum.minimumStakeSol,
    unitsConsumed: await simulateUnsigned(rpc, transaction)
  };
};

// JPool deposit with the direct-stake memo, built exactly as
// /api/jpool/stake/generate.
const jpoolCheck: CheckBody = async ({ wallet, voteAccount }, setStage) => {
  let built;
  try {
    built = await buildJpoolDepositTransaction({
      network: SELFTEST_NETWORK,
      wallet,
      voteAccount,
      lamports: JPOOL_SELFTEST_LAMPORTS
    });
  } catch (error) {
    // JPool refuses deposits until it updates the pool for a new epoch.
    if (
      error instanceof JpoolRouteError &&
      error.code === "JPOOL_POOL_UPDATING"
    ) {
      throw new SelftestSkip(error.code);
    }
    throw error;
  }
  setStage("simulate");
  const unitsConsumed = await simulateUnsigned(
    createRpcConnection(SELFTEST_NETWORK),
    built.transaction
  );
  return {
    depositSol: Number(JPOOL_SELFTEST_LAMPORTS) / LAMPORTS_PER_SOL,
    expectedJsol: built.expectedJsol.toString(),
    unitsConsumed
  };
};

const CHECKS: Record<SelftestCheck, CheckBody> = {
  native: nativeCheck,
  jpool: jpoolCheck
};

async function runCheck(body: CheckBody): Promise<SelftestCheckResult> {
  const startedAt = Date.now();
  let stage: SelftestStage = "config";
  try {
    const config = readConfig();
    stage = "generate";
    const result = await withTimeout(
      body(config, (next) => {
        stage = next;
      }),
      SELFTEST_TIMEOUT_MS
    );
    return { ok: true, ...result, elapsedMs: Date.now() - startedAt };
  } catch (error) {
    if (error instanceof SelftestSkip) {
      return {
        ok: true,
        skipped: error.message,
        elapsedMs: Date.now() - startedAt
      };
    }
    return {
      ok: false,
      stage: error instanceof SelftestFailure ? error.stage : stage,
      error: redactSelftestError(describeError(error)),
      elapsedMs: Date.now() - startedAt
    };
  }
}

// Runs the requested checks in parallel against mainnet for SELFTEST_WALLET.
export async function runSelftest(
  checks: readonly SelftestCheck[] = SELFTEST_CHECKS
): Promise<SelftestResult> {
  const startedAt = Date.now();
  const results = await Promise.all(
    checks.map(async (name) => [name, await runCheck(CHECKS[name])] as const)
  );
  return {
    ok: results.every(([, result]) => result.ok),
    network: SELFTEST_NETWORK,
    elapsedMs: Date.now() - startedAt,
    checks: Object.fromEntries(results)
  };
}
