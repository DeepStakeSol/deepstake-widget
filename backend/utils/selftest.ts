import { randomBytes } from "node:crypto";

import {
  address,
  getAddressDecoder,
  isAddress,
  type Address
} from "@solana/kit";

import { createRpcConnection } from "@/utils/solana/rpc";
import {
  buildNativeStakeTransaction,
  StakeGenerateError
} from "@/utils/solana/stake/generate";
import { getStakeMinimum } from "@/utils/solana/stake/minimum";
import { withTimeout } from "@/utils/timeout";

const SELFTEST_NETWORK = "mainnet";
// Generous next to the 3 s target: a slow but working RPC must not page.
const SELFTEST_TIMEOUT_MS = 10_000;
const MAX_ERROR_LENGTH = 300;

export type SelftestStage = "config" | "generate" | "simulate";

export type SelftestResult =
  | {
      ok: true;
      network: string;
      minimumSol: number;
      unitsConsumed: number | null;
      elapsedMs: number;
    }
  | {
      ok: false;
      network: string;
      stage: SelftestStage;
      error: string;
      elapsedMs: number;
    };

class SelftestFailure extends Error {
  constructor(
    public readonly stage: SelftestStage,
    message: string
  ) {
    super(message);
  }
}

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

// Builds a real native stake transaction for SELFTEST_WALLET at the current
// minimum, exactly as /api/stake/generate does, and simulates it without
// signatures. Nothing is signed or sent; the server holds no key.
export async function runNativeSelftest(): Promise<SelftestResult> {
  const startedAt = Date.now();
  let stage: SelftestStage = "config";
  try {
    const { wallet, voteAccount } = readConfig();
    stage = "generate";
    const { minimumStakeSol, unitsConsumed } = await withTimeout(
      (async () => {
        const rpc = createRpcConnection(SELFTEST_NETWORK);
        const minimum = await getStakeMinimum(SELFTEST_NETWORK, rpc);
        const wireTransaction = await buildNativeStakeTransaction({
          network: SELFTEST_NETWORK,
          rpc,
          stakeLamports: minimum.minimumStakeLamports,
          authority: wallet,
          // A fresh address with no key: the simulation skips signatures.
          newAccount: getAddressDecoder().decode(randomBytes(32)),
          voteAccount
        });

        stage = "simulate";
        const { value } = await rpc
          .simulateTransaction(wireTransaction, {
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
        return {
          minimumStakeSol: minimum.minimumStakeSol,
          unitsConsumed:
            value.unitsConsumed == null ? null : Number(value.unitsConsumed)
        };
      })(),
      SELFTEST_TIMEOUT_MS
    );

    return {
      ok: true,
      network: SELFTEST_NETWORK,
      minimumSol: minimumStakeSol,
      unitsConsumed,
      elapsedMs: Date.now() - startedAt
    };
  } catch (error) {
    return {
      ok: false,
      network: SELFTEST_NETWORK,
      stage: error instanceof SelftestFailure ? error.stage : stage,
      error: redactSelftestError(describeError(error)),
      elapsedMs: Date.now() - startedAt
    };
  }
}
