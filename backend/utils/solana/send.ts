import {
  getBase64Encoder,
  getCompiledTransactionMessageDecoder,
  getCompiledTransactionMessageEncoder,
  getSignatureFromTransaction,
  getTransactionDecoder,
  type CompiledTransactionMessage,
  type Signature,
  type Transaction
} from "@solana/kit";

import { getJpoolStakePoolAddress } from "@/utils/consts";
import { STAKE_POOL_PROGRAM_ADDRESS } from "@/utils/solana/blaze/stake-pool";
import {
  JPOOL_ERROR_MESSAGES,
  normalizeDepositSimulationError,
  type JpoolErrorCode
} from "@/utils/solana/jpool/errors";

// Solana packet data size: the largest wire transaction a leader accepts.
export const MAX_TRANSACTION_BYTES = 1232;
// Base64 of MAX_TRANSACTION_BYTES, with padding.
export const MAX_TRANSACTION_BASE64_LENGTH =
  Math.ceil(MAX_TRANSACTION_BYTES / 3) * 4;
// Upper bound for the whole JSON body: the transaction plus a small envelope.
export const MAX_SEND_BODY_BYTES = 4 * 1024;

const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

export type TransactionSendErrorCode =
  | "INVALID_NETWORK"
  | "INVALID_REQUEST"
  | "INVALID_TRANSACTION"
  | "TRANSACTION_NOT_SIGNED"
  | "TRANSACTION_SIGNATURE_INVALID"
  | "TRANSACTION_EXPIRED"
  | "TRANSACTION_INSUFFICIENT_FUNDS"
  | "TRANSACTION_SIMULATION_FAILED"
  | "TRANSACTION_SEND_FAILED"
  | "RPC_UNAVAILABLE";

// JPool codes are reused when a failure is attributed to a JPool deposit, so
// the frontend maps one code set for both generate and send.
export type SendRouteErrorCode =
  | TransactionSendErrorCode
  | Extract<
      JpoolErrorCode,
      "JPOOL_POOL_UPDATING" | "JPOOL_DEPOSITS_RESTRICTED" | "JPOOL_DEPOSIT_TOO_SMALL"
    >;

const SEND_ERROR_MESSAGES: Record<TransactionSendErrorCode, string> = {
  INVALID_NETWORK: "Invalid network",
  INVALID_REQUEST: "Request body is invalid",
  INVALID_TRANSACTION: "Transaction is malformed",
  TRANSACTION_NOT_SIGNED: "Transaction is not fully signed",
  TRANSACTION_SIGNATURE_INVALID: "Transaction signature verification failed",
  TRANSACTION_EXPIRED:
    "Transaction expired before it was sent. Please try again.",
  TRANSACTION_INSUFFICIENT_FUNDS:
    "Insufficient SOL balance to pay for this transaction",
  TRANSACTION_SIMULATION_FAILED: "Transaction simulation failed",
  TRANSACTION_SEND_FAILED: "Failed to send transaction",
  RPC_UNAVAILABLE: "Solana RPC is temporarily unavailable"
};

export function getSendErrorMessage(code: SendRouteErrorCode): string {
  return code in SEND_ERROR_MESSAGES
    ? SEND_ERROR_MESSAGES[code as TransactionSendErrorCode]
    : JPOOL_ERROR_MESSAGES[code as JpoolErrorCode];
}

export class TransactionSendError extends Error {
  constructor(
    public readonly code: SendRouteErrorCode,
    public readonly status: number,
    public readonly details?: unknown
  ) {
    super(getSendErrorMessage(code));
    this.name = "TransactionSendError";
  }
}

export interface DecodedSignedTransaction {
  transaction: Transaction;
  message: CompiledTransactionMessage;
  signature: Signature;
}

// Validates a base64 wire transaction and requires every signer slot to be
// filled. Signature validity is checked later by simulation with sigVerify.
export function decodeSignedTransaction(
  value: unknown
): DecodedSignedTransaction {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_TRANSACTION_BASE64_LENGTH ||
    value.length % 4 !== 0 ||
    !BASE64_PATTERN.test(value)
  ) {
    throw new TransactionSendError("INVALID_TRANSACTION", 400);
  }

  let transaction: Transaction;
  let message: CompiledTransactionMessage;
  try {
    const bytes = new Uint8Array(getBase64Encoder().encode(value));
    if (bytes.length > MAX_TRANSACTION_BYTES) throw new Error("too large");
    transaction = getTransactionDecoder().decode(bytes);
    message = getCompiledTransactionMessageDecoder().decode(
      transaction.messageBytes
    );
    // The transaction decoder takes every remaining byte as the message, so a
    // canonical round trip is what rejects trailing garbage.
    const canonical = getCompiledTransactionMessageEncoder().encode(message);
    if (
      canonical.length !== transaction.messageBytes.length ||
      canonical.some((byte, i) => byte !== transaction.messageBytes[i])
    ) {
      throw new Error("non-canonical message");
    }
  } catch {
    throw new TransactionSendError("INVALID_TRANSACTION", 400);
  }

  const signatures = Object.values(transaction.signatures);
  if (
    signatures.length === 0 ||
    signatures.length !== message.header.numSignerAccounts ||
    signatures.some((signature) => signature === null)
  ) {
    throw new TransactionSendError("TRANSACTION_NOT_SIGNED", 400);
  }

  return {
    transaction,
    message,
    signature: getSignatureFromTransaction(transaction)
  };
}

// Index of the first Stake Pool instruction that targets the JPool pool, or
// -1. Only static accounts are resolved; lookup-table accounts never match.
export function findJpoolDepositInstructionIndex(
  message: CompiledTransactionMessage,
  network: string
): number {
  const jpoolPool = getJpoolStakePoolAddress(network);
  if (!jpoolPool) return -1;
  const accounts = message.staticAccounts;
  return message.instructions.findIndex(
    (instruction) =>
      accounts[instruction.programAddressIndex] === STAKE_POOL_PROGRAM_ADDRESS &&
      instruction.accountIndices?.[0] !== undefined &&
      accounts[instruction.accountIndices[0]] === jpoolPool
  );
}

const JPOOL_SEND_STATUS: Partial<Record<JpoolErrorCode, number>> = {
  JPOOL_POOL_UPDATING: 503,
  JPOOL_DEPOSITS_RESTRICTED: 503,
  JPOOL_DEPOSIT_TOO_SMALL: 400
};

export type SimulationOutcome =
  | { kind: "already_processed" }
  | { kind: "error"; code: SendRouteErrorCode; status: number };

// Maps a simulation `err` value. Transaction-level errors are generic; a
// Custom error inside a JPool DepositSol goes through the shared JPool
// normalizer so generate and send report the same codes.
export function normalizeSendSimulationError(
  err: unknown,
  message: CompiledTransactionMessage,
  network: string
): SimulationOutcome {
  switch (err) {
    case "AlreadyProcessed":
      return { kind: "already_processed" };
    case "BlockhashNotFound":
      return { kind: "error", code: "TRANSACTION_EXPIRED", status: 409 };
    case "SignatureFailure":
    case "MissingSignatureForFee":
      return {
        kind: "error",
        code: "TRANSACTION_SIGNATURE_INVALID",
        status: 400
      };
    case "InsufficientFundsForFee":
    case "InsufficientFundsForRent":
      return {
        kind: "error",
        code: "TRANSACTION_INSUFFICIENT_FUNDS",
        status: 400
      };
  }

  const depositIndex = findJpoolDepositInstructionIndex(message, network);
  if (depositIndex >= 0) {
    const code = normalizeDepositSimulationError(err, depositIndex);
    const status = JPOOL_SEND_STATUS[code];
    if (status !== undefined) {
      return { kind: "error", code: code as SendRouteErrorCode, status };
    }
  }
  return { kind: "error", code: "TRANSACTION_SIMULATION_FAILED", status: 400 };
}
