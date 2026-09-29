import { describe, expect, it } from "vitest";

import { normalizeDepositSimulationError } from "./errors";

describe("normalizeDepositSimulationError", () => {
  it.each([
    [17, "JPOOL_POOL_UPDATING"],
    [29, "JPOOL_DEPOSIT_TOO_SMALL"],
    [7, "JPOOL_DEPOSITS_RESTRICTED"],
    [31, "JPOOL_DEPOSITS_RESTRICTED"],
    [1, "JPOOL_SIMULATION_FAILED"],
    [99, "JPOOL_SIMULATION_FAILED"]
  ])("maps DepositSol Custom %i to %s", (custom, code) => {
    expect(
      normalizeDepositSimulationError(
        { InstructionError: [1, { Custom: custom }] },
        1
      )
    ).toBe(code);
  });

  it("follows the DepositSol index with and without ATA creation", () => {
    const err = { InstructionError: [0, { Custom: 17 }] };
    expect(normalizeDepositSimulationError(err, 0)).toBe("JPOOL_POOL_UPDATING");
    expect(normalizeDepositSimulationError(err, 1)).toBe(
      "JPOOL_SIMULATION_FAILED"
    );
  });

  it("maps fee-payer balance failures", () => {
    expect(normalizeDepositSimulationError("InsufficientFundsForFee", 0)).toBe(
      "JPOOL_INSUFFICIENT_FUNDS"
    );
  });

  it("keeps unknown shapes generic", () => {
    expect(normalizeDepositSimulationError(null, 0)).toBe(
      "JPOOL_SIMULATION_FAILED"
    );
    expect(
      normalizeDepositSimulationError({ InstructionError: [0, "Foo"] }, 0)
    ).toBe("JPOOL_SIMULATION_FAILED");
  });
});
