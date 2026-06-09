import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GetStakeAccountResponse } from "./solana/stake/get-stake-accounts";
import {
  clearStakeAccountsCache,
  getCachedStakeAccounts,
  invalidateStakeAccountsCache,
  setCachedStakeAccounts,
  STAKE_ACCOUNTS_CACHE_TTL_MS,
} from "./stakeAccountsCache";

const accounts = [{ address: "stake-account" }] as unknown as GetStakeAccountResponse[];

describe("stake accounts cache", () => {
  beforeEach(() => {
    clearStakeAccountsCache();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });

  it("returns cached data for the same owner and network", () => {
    setCachedStakeAccounts("owner", "devnet", accounts);

    expect(getCachedStakeAccounts("owner", "devnet")).toBe(accounts);
  });

  it("keys entries by network and owner", () => {
    setCachedStakeAccounts("owner", "devnet", accounts);

    expect(getCachedStakeAccounts("owner", "mainnet")).toBeNull();
    expect(getCachedStakeAccounts("other-owner", "devnet")).toBeNull();
  });

  it("expires entries after the TTL", () => {
    setCachedStakeAccounts("owner", "devnet", accounts);
    vi.advanceTimersByTime(STAKE_ACCOUNTS_CACHE_TTL_MS + 1);

    expect(getCachedStakeAccounts("owner", "devnet")).toBeNull();
  });

  it("can invalidate one entry", () => {
    setCachedStakeAccounts("owner", "devnet", accounts);
    invalidateStakeAccountsCache("owner", "devnet");

    expect(getCachedStakeAccounts("owner", "devnet")).toBeNull();
  });
});
