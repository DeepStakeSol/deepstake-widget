import { type NextRequest, NextResponse } from "next/server";
import {
  isSolanaError,
  SOLANA_ERROR__JSON_RPC__INVALID_PARAMS,
  SOLANA_ERROR__JSON_RPC__SERVER_ERROR_TRANSACTION_SIGNATURE_LEN_MISMATCH,
  SOLANA_ERROR__JSON_RPC__SERVER_ERROR_TRANSACTION_SIGNATURE_VERIFICATION_FAILURE,
  SOLANA_ERROR__JSON_RPC__SERVER_ERROR_UNSUPPORTED_TRANSACTION_VERSION,
  type Base64EncodedWireTransaction
} from "@solana/kit";

import { clientIp, consumeRateLimit } from "@/utils/rateLimit";
import { getRedisClient, isRedisConfigured } from "@/utils/redis";
import { createRpcConnection, getRpcEndpoint } from "@/utils/solana/rpc";
import {
  decodeSignedTransaction,
  MAX_SEND_BODY_BYTES,
  normalizeSendSimulationError,
  TransactionSendError
} from "@/utils/solana/send";
import { parseWalletNetwork } from "@/utils/walletData/network";

const LOG_LABEL = "Transaction send error:";
// Every widget tab relays through this route, so the limit is per IP and sized
// well above one person staking; it only caps scripted use of our RPC credits.
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;
const RATE_KEY_PREFIX = "rate-limit:v1:tx-send";

// Unlike /jpool/bind, the limiter fails open: a Redis outage must not stop
// staking.
async function limit(request: NextRequest): Promise<void> {
  if (!isRedisConfigured()) return;
  let result;
  try {
    result = await consumeRateLimit(
      await getRedisClient(),
      `${RATE_KEY_PREFIX}:ip:${clientIp(request.headers)}`,
      RATE_LIMIT,
      RATE_WINDOW_MS
    );
  } catch (error) {
    console.warn(
      "Transaction send rate limit skipped:",
      error instanceof Error ? error.message : error
    );
    return;
  }
  if (!result.allowed) {
    throw new TransactionSendError("RATE_LIMITED", 429, {
      retryAfterSeconds: result.retryAfterSeconds
    });
  }
}

async function readTransaction(
  request: NextRequest
): Promise<Base64EncodedWireTransaction> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_SEND_BODY_BYTES) {
    throw new TransactionSendError("INVALID_REQUEST", 413);
  }

  let body: unknown;
  try {
    const text = await request.text();
    if (Buffer.byteLength(text, "utf8") > MAX_SEND_BODY_BYTES) {
      throw new TransactionSendError("INVALID_REQUEST", 413);
    }
    body = JSON.parse(text);
  } catch (error) {
    if (error instanceof TransactionSendError) throw error;
    throw new TransactionSendError("INVALID_REQUEST", 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new TransactionSendError("INVALID_REQUEST", 400);
  }
  // Shape is validated by decodeSignedTransaction.
  return (body as Record<string, unknown>)
    .transaction as Base64EncodedWireTransaction;
}

// JSON-RPC errors that mean the transaction itself is bad, not the RPC.
function rpcRejection(error: unknown): TransactionSendError | null {
  if (
    isSolanaError(
      error,
      SOLANA_ERROR__JSON_RPC__SERVER_ERROR_TRANSACTION_SIGNATURE_VERIFICATION_FAILURE
    )
  ) {
    return new TransactionSendError("TRANSACTION_SIGNATURE_INVALID", 400);
  }
  if (
    isSolanaError(error, SOLANA_ERROR__JSON_RPC__INVALID_PARAMS) ||
    isSolanaError(
      error,
      SOLANA_ERROR__JSON_RPC__SERVER_ERROR_TRANSACTION_SIGNATURE_LEN_MISMATCH
    ) ||
    isSolanaError(
      error,
      SOLANA_ERROR__JSON_RPC__SERVER_ERROR_UNSUPPORTED_TRANSACTION_VERSION
    )
  ) {
    return new TransactionSendError("INVALID_TRANSACTION", 400);
  }
  return null;
}

function errorResponse(error: unknown, signature?: string) {
  if (error instanceof TransactionSendError && error.code === "RATE_LIMITED") {
    const { retryAfterSeconds } = error.details as { retryAfterSeconds: number };
    return NextResponse.json(
      { error: error.message, code: error.code, retryAfterSeconds },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }
  if (error instanceof TransactionSendError) {
    const unmapped = error.code === "TRANSACTION_SIMULATION_FAILED";
    if (error.status >= 500 || unmapped) {
      console.error(
        LOG_LABEL,
        error.code,
        signature ?? null,
        JSON.stringify(error.details ?? null)
      );
    }
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
        ...(unmapped && error.details !== undefined
          ? { details: error.details }
          : {}),
        // The signed bytes may still have reached the cluster; the client can
        // confirm this signature before asking the user to sign again.
        ...(error.code === "TRANSACTION_SEND_FAILED" && signature
          ? { signature }
          : {})
      },
      { status: error.status }
    );
  }
  console.error(LOG_LABEL, signature ?? null, error);
  return NextResponse.json(
    { error: "Failed to send transaction", code: "TRANSACTION_SEND_FAILED" },
    { status: 500 }
  );
}

// POST /api/transaction/send?network=mainnet|devnet
// Body: { transaction: "<base64 signed wire transaction>" }
// Rate-limited per IP (429 RATE_LIMITED with Retry-After). Simulates with
// signature verification, relays the exact bytes and returns { signature }. Confirmation and cache invalidation stay on
// /api/transaction/confirm.
export async function POST(request: NextRequest) {
  let signature: string | undefined;
  try {
    // The network is required: a default would silently relay to the wrong
    // cluster.
    const networkParam = request.nextUrl.searchParams.get("network");
    const network = networkParam
      ? parseWalletNetwork(networkParam, "mainnet")
      : null;
    if (!network) throw new TransactionSendError("INVALID_NETWORK", 400);

    // Per IP before reading the body.
    await limit(request);
    const wireTransaction = await readTransaction(request);
    const decoded = decodeSignedTransaction(wireTransaction);
    signature = decoded.signature;

    if (!getRpcEndpoint(network)) {
      throw new TransactionSendError("RPC_UNAVAILABLE", 503);
    }
    const rpc = createRpcConnection(network);

    let simulation;
    try {
      simulation = await rpc
        .simulateTransaction(wireTransaction, {
          commitment: "confirmed",
          encoding: "base64",
          replaceRecentBlockhash: false,
          sigVerify: true
        })
        .send();
    } catch (error) {
      throw (
        rpcRejection(error) ??
        new TransactionSendError("RPC_UNAVAILABLE", 503)
      );
    }

    if (simulation.value.err) {
      const outcome = normalizeSendSimulationError(
        simulation.value.err,
        decoded.message,
        network
      );
      // The same bytes already landed (retry after a lost response); the
      // client confirms the signature as usual.
      if (outcome.kind === "already_processed") {
        return NextResponse.json({ signature });
      }
      throw new TransactionSendError(outcome.code, outcome.status, {
        err: simulation.value.err,
        logs: simulation.value.logs?.slice(-10) ?? null
      });
    }

    let sentSignature: string;
    try {
      sentSignature = await rpc
        .sendTransaction(wireTransaction, {
          encoding: "base64",
          skipPreflight: true
        })
        .send();
    } catch (error) {
      throw (
        rpcRejection(error) ??
        new TransactionSendError("TRANSACTION_SEND_FAILED", 502)
      );
    }
    if (sentSignature !== signature) {
      console.error(LOG_LABEL, "signature mismatch", signature, sentSignature);
    }

    return NextResponse.json({ signature });
  } catch (error) {
    return errorResponse(error, signature);
  }
}
