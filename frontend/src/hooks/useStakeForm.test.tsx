import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { UiWalletAccount } from "@wallet-standard/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SelectedWalletAccountContext } from "../context/SelectedWalletAccountContext";
import { PRIORITY_FEE_BUFFER, STAKE_PROGRAM } from "../utils/constants";

const { fetchSolBalanceMock, fetchStakeAccountsMock, useIsWalletConnectedMock, useNetworkMock } =
  vi.hoisted(() => ({
    fetchSolBalanceMock: vi.fn(),
    fetchStakeAccountsMock: vi.fn(),
    useIsWalletConnectedMock: vi.fn(),
    useNetworkMock: vi.fn(),
  }));

vi.mock("../utils/api", () => ({
  fetchSolBalance: fetchSolBalanceMock,
  fetchStakeAccounts: fetchStakeAccountsMock,
}));

vi.mock("./useIsWalletConnected", () => ({
  useIsWalletConnected: useIsWalletConnectedMock,
}));

vi.mock("../context/NetworkContext", () => ({
  useNetwork: useNetworkMock,
}));

import { useStakeForm } from "./useStakeForm";

const account = { address: "wallet-address" } as UiWalletAccount;
const stakeAccounts = [{ address: "stake-account" }] as never[];

function wrapperWithAccount(selectedAccount: UiWalletAccount | undefined) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <SelectedWalletAccountContext.Provider value={[selectedAccount, vi.fn()]}>
        {children}
      </SelectedWalletAccountContext.Provider>
    );
  };
}

describe("useStakeForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchSolBalanceMock.mockResolvedValue(10);
    fetchStakeAccountsMock.mockResolvedValue(stakeAccounts);
    useIsWalletConnectedMock.mockReturnValue(true);
    useNetworkMock.mockReturnValue({ network: "devnet", setNetwork: vi.fn() });
  });

  it("resets wallet data when no wallet is selected", () => {
    useIsWalletConnectedMock.mockReturnValue(false);
    const { result } = renderHook(() => useStakeForm(), {
      wrapper: wrapperWithAccount(undefined),
    });

    expect(result.current.selectedWalletAccount).toBeUndefined();
    expect(result.current.isConnected).toBe(false);
    expect(result.current.balance).toBe(0);
    expect(result.current.stakeAccounts).toEqual([]);
    expect(fetchSolBalanceMock).not.toHaveBeenCalled();
    expect(fetchStakeAccountsMock).not.toHaveBeenCalled();
  });

  it("fetches balance and stake accounts for a connected wallet", async () => {
    const { result } = renderHook(() => useStakeForm(), {
      wrapper: wrapperWithAccount(account),
    });

    await waitFor(() => expect(result.current.balance).toBe(10));
    await waitFor(() => expect(result.current.stakeAccounts).toBe(stakeAccounts));
    expect(fetchSolBalanceMock).toHaveBeenCalledWith("wallet-address", "devnet");
    expect(fetchStakeAccountsMock).toHaveBeenCalledWith("wallet-address", "devnet");
  });

  it("normalizes stake amount input", () => {
    const { result } = renderHook(() => useStakeForm(), {
      wrapper: wrapperWithAccount(undefined),
    });

    act(() => result.current.handleInputChange("abc12,34.567899xyz"));

    expect(result.current.stakeAmount).toBe("12.345678");
    expect(result.current.formattedStakeAmount).toBe("12.345678");

    act(() => result.current.handleInputChange(".5"));

    expect(result.current.stakeAmount).toBe("0.5");
  });

  it("calculates insufficient balance using rent reserve and priority fee buffer", async () => {
    fetchSolBalanceMock.mockResolvedValue(1);
    const { result } = renderHook(() => useStakeForm(), {
      wrapper: wrapperWithAccount(account),
    });

    await waitFor(() => expect(result.current.balance).toBe(1));
    act(() => result.current.handleInputChange("1"));

    expect(result.current.inSufficientBalance).toBe(true);
    expect(result.current.stakeSol).toBe(1);
    expect(1).toBeGreaterThan(
      result.current.balance - STAKE_PROGRAM.STAKE_ACCOUNT_RENT - PRIORITY_FEE_BUFFER
    );
  });

  it("clears input and refreshes wallet data on reset", async () => {
    const { result } = renderHook(() => useStakeForm(), {
      wrapper: wrapperWithAccount(account),
    });

    await waitFor(() => expect(result.current.balance).toBe(10));
    await waitFor(() => expect(result.current.stakeAccounts).toBe(stakeAccounts));
    fetchSolBalanceMock.mockClear();
    fetchStakeAccountsMock.mockClear();

    act(() => result.current.handleInputChange("2.5"));
    await act(async () => {
      result.current.resetFormAndRefreshBalance();
    });

    expect(result.current.stakeAmount).toBe("");
    expect(result.current.formattedStakeAmount).toBe("");
    expect(fetchSolBalanceMock).toHaveBeenCalledTimes(1);
    expect(fetchStakeAccountsMock).toHaveBeenCalledTimes(1);
  });
});
