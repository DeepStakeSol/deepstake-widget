import type { Address } from "@solana/kit";
import { describe, expect, it } from "vitest";

import { STAKE_PROGRAM } from "../../constants";
import { stakeAccountsFilter } from "./stake-filters";

describe("stakeAccountsFilter", () => {
  it("builds owner and size filters", () => {
    expect(stakeAccountsFilter({ owner: "owner" as Address })).toEqual([
      {
        memcmp: {
          offset: BigInt(STAKE_PROGRAM.STAKE_ACCOUNT_FILTERS.ownerOffset),
          encoding: "base58",
          bytes: "owner",
        },
      },
      {
        dataSize: BigInt(STAKE_PROGRAM.STAKE_ACCOUNT_FILTERS.sizeOf),
      },
    ]);
  });

  it("adds a vote account filter when provided", () => {
    const filters = stakeAccountsFilter({ owner: "owner" as Address, vote: "vote" as Address });

    expect(filters).toHaveLength(3);
    expect(filters[2]).toEqual({
      memcmp: {
        offset: BigInt(STAKE_PROGRAM.STAKE_ACCOUNT_FILTERS.voteOffset),
        encoding: "base58",
        bytes: "vote",
      },
    });
  });
});
