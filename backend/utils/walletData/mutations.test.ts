import { describe, expect, it } from "vitest";

import { resourceForMutation, WALLET_MUTATIONS, type WalletMutation } from "./mutations";

describe("resourceForMutation", () => {
  it("maps every mutation explicitly", () => {
    expect(
      Object.fromEntries(WALLET_MUTATIONS.map((m) => [m, resourceForMutation(m)]))
    ).toEqual({
      "native-stake": "native-stake",
      "native-unstake": "native-stake",
      "native-withdraw": "native-stake",
      "blaze-stake": "blaze-applied",
      "vault-stake": "vault-manage",
      "jpool-stake": "jpool-manage"
    });
  });

  it("throws on an unknown mutation instead of falling through to Vault", () => {
    expect(() => resourceForMutation("other-stake" as WalletMutation)).toThrow(
      "Unknown wallet mutation: other-stake"
    );
  });
});
