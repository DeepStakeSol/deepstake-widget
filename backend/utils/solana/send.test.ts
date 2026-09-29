import {
  address,
  appendTransactionMessageInstructions,
  compileTransaction,
  createTransactionMessage,
  generateKeyPairSigner,
  getCompiledTransactionMessageDecoder,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  AccountRole,
  type Address,
  type Blockhash,
  type IInstruction
} from "@solana/kit";
import { beforeAll, describe, expect, it } from "vitest";

import {
  findJpoolDepositInstructionIndex,
  normalizeSendSimulationError
} from "./send";

const JPOOL_POOL = address("CtMyWsrUtAwXWiGr9WjHT5fC3p3fgV8cyGpLTo2LJzG1");
const STAKE_POOL_PROGRAM = address(
  "SPoo1Ku8WFXoNDMHPsrGSTSG1Y47rzgn41SLUNakuHy"
);
const MEMO_PROGRAM = address("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

let payer: Address;

beforeAll(async () => {
  payer = (await generateKeyPairSigner()).address;
});

function compiled(instructions: IInstruction[]) {
  const message = pipe(
    createTransactionMessage({ version: "legacy" }),
    (msg) => setTransactionMessageFeePayer(payer, msg),
    (msg) =>
      setTransactionMessageLifetimeUsingBlockhash(
        {
          blockhash: "4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi" as Blockhash,
          lastValidBlockHeight: BigInt(1)
        },
        msg
      ),
    (msg) => appendTransactionMessageInstructions(instructions, msg)
  );
  return getCompiledTransactionMessageDecoder().decode(
    compileTransaction(message).messageBytes
  );
}

const memo: IInstruction = {
  programAddress: MEMO_PROGRAM,
  accounts: [],
  data: new Uint8Array([120])
};
const deposit = (pool: Address): IInstruction => ({
  programAddress: STAKE_POOL_PROGRAM,
  accounts: [{ address: pool, role: AccountRole.WRITABLE }],
  data: new Uint8Array([14])
});

describe("findJpoolDepositInstructionIndex", () => {
  it("finds the Stake Pool instruction whose first account is the JPool pool", () => {
    expect(
      findJpoolDepositInstructionIndex(
        compiled([memo, memo, deposit(JPOOL_POOL), memo]),
        "mainnet"
      )
    ).toBe(2);
  });

  it("ignores other pools, other programs and devnet", () => {
    const other = address("stk9ApL5HeVAwPLr3TLhDXdZS8ptVu7zp6ov8HFDuMi");
    expect(
      findJpoolDepositInstructionIndex(compiled([deposit(other)]), "mainnet")
    ).toBe(-1);
    expect(findJpoolDepositInstructionIndex(compiled([memo]), "mainnet")).toBe(
      -1
    );
    expect(
      findJpoolDepositInstructionIndex(compiled([deposit(JPOOL_POOL)]), "devnet")
    ).toBe(-1);
  });
});

describe("normalizeSendSimulationError", () => {
  const message = () => compiled([deposit(JPOOL_POOL), memo]);

  it.each([
    [{ InstructionError: [0, { Custom: 17 }] }, "JPOOL_POOL_UPDATING", 503],
    [{ InstructionError: [0, { Custom: 7 }] }, "JPOOL_DEPOSITS_RESTRICTED", 503],
    [{ InstructionError: [0, { Custom: 31 }] }, "JPOOL_DEPOSITS_RESTRICTED", 503],
    [{ InstructionError: [0, { Custom: 29 }] }, "JPOOL_DEPOSIT_TOO_SMALL", 400],
    [{ InstructionError: [0, { Custom: 1 }] }, "TRANSACTION_SIMULATION_FAILED", 400],
    [{ InstructionError: [1, { Custom: 17 }] }, "TRANSACTION_SIMULATION_FAILED", 400],
    ["AccountInUse", "TRANSACTION_SIMULATION_FAILED", 400]
  ])("maps %j", (err, code, status) => {
    expect(normalizeSendSimulationError(err, message(), "mainnet")).toEqual({
      kind: "error",
      code,
      status
    });
  });

  it("reports AlreadyProcessed separately", () => {
    expect(
      normalizeSendSimulationError("AlreadyProcessed", message(), "mainnet")
    ).toEqual({ kind: "already_processed" });
  });
});
