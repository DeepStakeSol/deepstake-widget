import {
  address,
  appendTransactionMessageInstructions,
  compileTransaction,
  createTransactionMessage,
  generateKeyPairSigner,
  getBase64Decoder,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  getTransactionEncoder,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  getSolanaErrorFromJsonRpcError,
  AccountRole,
  type Blockhash,
  type IInstruction,
  type Address,
  type KeyPairSigner
} from "@solana/kit";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { MAX_SEND_BODY_BYTES } from "@/utils/solana/send";

const { rpcState, simulateMock, sendMock } = vi.hoisted(() => ({
  rpcState: {
    endpoint: "https://rpc.example" as string,
    simulation: { err: null as unknown, logs: [] as string[] | null },
    simulateError: null as unknown,
    sendError: null as unknown,
    sentSignature: null as string | null
  },
  simulateMock: vi.fn(),
  sendMock: vi.fn()
}));

vi.mock("@/utils/solana/rpc", () => ({
  getRpcEndpoint: vi.fn(() => rpcState.endpoint),
  createRpcConnection: vi.fn(() => ({
    simulateTransaction: simulateMock,
    sendTransaction: sendMock
  }))
}));

import { POST } from "./route";

const JPOOL_POOL = address("CtMyWsrUtAwXWiGr9WjHT5fC3p3fgV8cyGpLTo2LJzG1");
const OTHER_POOL = address("stk9ApL5HeVAwPLr3TLhDXdZS8ptVu7zp6ov8HFDuMi");
const STAKE_POOL_PROGRAM = address(
  "SPoo1Ku8WFXoNDMHPsrGSTSG1Y47rzgn41SLUNakuHy"
);
const MEMO_PROGRAM = address("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const BLOCKHASH = "4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi" as Blockhash;

let wallet: KeyPairSigner;

function memo(text: string): IInstruction {
  return {
    programAddress: MEMO_PROGRAM,
    accounts: [],
    data: new TextEncoder().encode(text)
  };
}

function deposit(pool: Address = JPOOL_POOL): IInstruction {
  return {
    programAddress: STAKE_POOL_PROGRAM,
    accounts: [
      { address: pool, role: AccountRole.WRITABLE },
      { address: wallet.address, role: AccountRole.WRITABLE_SIGNER }
    ],
    data: new Uint8Array([14])
  };
}

async function signedTransaction(instructions: IInstruction[]) {
  const message = pipe(
    createTransactionMessage({ version: "legacy" }),
    (msg) => setTransactionMessageFeePayerSigner(wallet, msg),
    (msg) =>
      setTransactionMessageLifetimeUsingBlockhash(
        { blockhash: BLOCKHASH, lastValidBlockHeight: BigInt(100) },
        msg
      ),
    (msg) => appendTransactionMessageInstructions(instructions, msg)
  );
  const transaction = await signTransactionMessageWithSigners(message);
  return {
    wire: getBase64EncodedWireTransaction(transaction),
    signature: getSignatureFromTransaction(transaction),
    transaction
  };
}

function unsignedTransaction(instructions: IInstruction[]) {
  const message = pipe(
    createTransactionMessage({ version: "legacy" }),
    (msg) => setTransactionMessageFeePayerSigner(wallet, msg),
    (msg) =>
      setTransactionMessageLifetimeUsingBlockhash(
        { blockhash: BLOCKHASH, lastValidBlockHeight: BigInt(100) },
        msg
      ),
    (msg) => appendTransactionMessageInstructions(instructions, msg)
  );
  return getBase64EncodedWireTransaction(compileTransaction(message));
}

function request(
  body: unknown,
  {
    network = "mainnet" as string | null,
    headers = {} as Record<string, string>
  } = {}
) {
  const url = new URL("http://localhost/api/transaction/send");
  if (network !== null) url.searchParams.set("network", network);
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  return {
    nextUrl: url,
    headers: new Headers(headers),
    text: () => Promise.resolve(raw)
  } as never;
}

async function post(body: unknown, options?: Parameters<typeof request>[1]) {
  const response = await POST(request(body, options));
  return { status: response.status, body: await response.json() };
}

describe("POST /api/transaction/send", () => {
  beforeAll(async () => {
    wallet = await generateKeyPairSigner();
  });

  beforeEach(() => {
    rpcState.endpoint = "https://rpc.example";
    rpcState.simulation = { err: null, logs: [] };
    rpcState.simulateError = null;
    rpcState.sendError = null;
    rpcState.sentSignature = null;
    simulateMock.mockReset().mockImplementation(() => ({
      send: () =>
        rpcState.simulateError
          ? Promise.reject(rpcState.simulateError)
          : Promise.resolve({ value: rpcState.simulation })
    }));
    sendMock.mockReset().mockImplementation(() => ({
      send: () =>
        rpcState.sendError
          ? Promise.reject(rpcState.sendError)
          : Promise.resolve(rpcState.sentSignature)
    }));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  describe("input validation", () => {
    it("requires an explicit supported network", async () => {
      const { wire } = await signedTransaction([memo("x")]);
      for (const network of [null, "", "testnet", "localnet"]) {
        const result = await post({ transaction: wire }, { network });
        expect(result.status).toBe(400);
        expect(result.body.code).toBe("INVALID_NETWORK");
      }
      expect(simulateMock).not.toHaveBeenCalled();
    });

    it("rejects malformed bodies", async () => {
      for (const body of ["{not json", "null", "[]", '"text"']) {
        const result = await post(body);
        expect(result.status).toBe(400);
        expect(result.body.code).toBe("INVALID_REQUEST");
      }
    });

    it("rejects bodies over the size limit", async () => {
      const declared = await post(
        { transaction: "AA==" },
        { headers: { "content-length": String(MAX_SEND_BODY_BYTES + 1) } }
      );
      expect(declared.status).toBe(413);

      const actual = await post({ transaction: "A".repeat(MAX_SEND_BODY_BYTES) });
      expect(actual.status).toBe(413);
      expect(actual.body.code).toBe("INVALID_REQUEST");
    });

    it("rejects missing, non-base64 and undecodable transactions", async () => {
      const { transaction } = await signedTransaction([memo("x")]);
      const bytes = new Uint8Array(getTransactionEncoder().encode(transaction));
      const withTrailing = new Uint8Array([...bytes, 0, 0, 0]);
      const oversized = getBase64Decoder().decode(new Uint8Array(1233));

      for (const value of [
        undefined,
        42,
        "",
        "not base64!",
        "AAA", // not a multiple of 4
        "AAAA", // decodes but is not a transaction
        getBase64Decoder().decode(withTrailing),
        oversized
      ]) {
        const result = await post({ transaction: value });
        expect(result.status, String(value).slice(0, 20)).toBe(400);
        expect(result.body.code).toBe("INVALID_TRANSACTION");
      }
      expect(simulateMock).not.toHaveBeenCalled();
    });

    it("rejects transactions with an empty signer slot", async () => {
      const result = await post({
        transaction: unsignedTransaction([memo("x")])
      });
      expect(result.status).toBe(400);
      expect(result.body.code).toBe("TRANSACTION_NOT_SIGNED");
      expect(simulateMock).not.toHaveBeenCalled();
    });

    it("returns 503 when the network has no RPC endpoint", async () => {
      rpcState.endpoint = "";
      const { wire } = await signedTransaction([memo("x")]);
      const result = await post({ transaction: wire });
      expect(result.status).toBe(503);
      expect(result.body.code).toBe("RPC_UNAVAILABLE");
    });
  });

  describe("simulation", () => {
    it("maps an RPC signature verification failure", async () => {
      // Built the way the kit RPC transport converts a JSON-RPC error.
      rpcState.simulateError = getSolanaErrorFromJsonRpcError({
        code: -32003,
        message: "Transaction signature verification failure"
      });
      const { wire } = await signedTransaction([memo("x")]);
      const result = await post({ transaction: wire });
      expect(result.status).toBe(400);
      expect(result.body.code).toBe("TRANSACTION_SIGNATURE_INVALID");
      expect(sendMock).not.toHaveBeenCalled();
    });

    it("maps an RPC outage to 503", async () => {
      rpcState.simulateError = new Error("socket hang up");
      const { wire } = await signedTransaction([memo("x")]);
      const result = await post({ transaction: wire });
      expect(result.status).toBe(503);
      expect(result.body.code).toBe("RPC_UNAVAILABLE");
    });

    it.each([
      ["BlockhashNotFound", 409, "TRANSACTION_EXPIRED"],
      ["SignatureFailure", 400, "TRANSACTION_SIGNATURE_INVALID"],
      ["InsufficientFundsForFee", 400, "TRANSACTION_INSUFFICIENT_FUNDS"],
      ["InsufficientFundsForRent", 400, "TRANSACTION_INSUFFICIENT_FUNDS"]
    ])("maps %s", async (err, status, code) => {
      rpcState.simulation = { err, logs: null };
      const { wire } = await signedTransaction([deposit(), memo("x")]);
      const result = await post({ transaction: wire });
      expect(result.status).toBe(status);
      expect(result.body.code).toBe(code);
      expect(result.body.details).toBeUndefined();
      expect(sendMock).not.toHaveBeenCalled();
    });

    it("maps a JPool DepositSol Stake Pool error through the shared normalizer", async () => {
      rpcState.simulation = {
        err: { InstructionError: [1, { Custom: 17 }] },
        logs: []
      };
      const { wire } = await signedTransaction([memo("a"), deposit(), memo("b")]);
      const result = await post({ transaction: wire });
      expect(result.status).toBe(503);
      expect(result.body).toEqual({
        error:
          "JPool is updating for the new epoch. Please try again in a few minutes.",
        code: "JPOOL_POOL_UPDATING"
      });
    });

    it("keeps Custom errors generic outside a JPool DepositSol", async () => {
      const cases: Array<[IInstruction[], string]> = [
        [[memo("a"), deposit(), memo("b")], "mainnet"], // wrong index below
        [[deposit(OTHER_POOL), memo("b")], "mainnet"], // not the JPool pool
        [[deposit(), memo("b")], "devnet"] // no JPool pool on devnet
      ];
      for (const [index, [instructions, network]] of cases.entries()) {
        rpcState.simulation = {
          err: { InstructionError: [index === 0 ? 2 : 0, { Custom: 17 }] },
          logs: ["Program log: failed"]
        };
        const { wire } = await signedTransaction(instructions);
        const result = await post({ transaction: wire }, { network });
        expect(result.status).toBe(400);
        expect(result.body.code).toBe("TRANSACTION_SIMULATION_FAILED");
        expect(result.body.details).toEqual({
          err: rpcState.simulation.err,
          logs: ["Program log: failed"]
        });
      }
      expect(sendMock).not.toHaveBeenCalled();
    });

    it("simulates the exact bytes with signature verification", async () => {
      const { wire, signature } = await signedTransaction([deposit(), memo("x")]);
      rpcState.sentSignature = signature;
      await post({ transaction: wire });
      expect(simulateMock).toHaveBeenCalledWith(wire, {
        commitment: "confirmed",
        encoding: "base64",
        replaceRecentBlockhash: false,
        sigVerify: true
      });
    });
  });

  describe("send", () => {
    it("relays the exact bytes and returns the fee payer signature", async () => {
      const { wire, signature } = await signedTransaction([deposit(), memo("x")]);
      rpcState.sentSignature = signature;
      const result = await post({ transaction: wire, cacheMutation: {} });
      expect(result).toEqual({ status: 200, body: { signature } });
      expect(sendMock).toHaveBeenCalledWith(wire, {
        encoding: "base64",
        skipPreflight: true
      });
    });

    it("treats AlreadyProcessed as success without resending", async () => {
      rpcState.simulation = { err: "AlreadyProcessed", logs: null };
      const { wire, signature } = await signedTransaction([memo("x")]);
      const result = await post({ transaction: wire });
      expect(result).toEqual({ status: 200, body: { signature } });
      expect(sendMock).not.toHaveBeenCalled();
    });

    it("returns 502 with the signature when the send call fails", async () => {
      rpcState.sendError = new Error("timeout");
      const { wire, signature } = await signedTransaction([memo("x")]);
      const result = await post({ transaction: wire });
      expect(result.status).toBe(502);
      expect(result.body).toEqual({
        error: "Failed to send transaction",
        code: "TRANSACTION_SEND_FAILED",
        signature
      });
    });
  });
});
