import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../utils/solana/address", () => ({
  shortenAddress: vi.fn(() => "short-wallet"),
}));

vi.mock("../WalletDisconnectButton", () => ({
  WalletDisconnectButton: () => <button type="button">Disconnect</button>,
}));

vi.mock("../../utils/imageUrl", () => ({
  cssImageUrl: vi.fn((src: string) => 'url("' + src + '")'),
}));

import { WalletInfo } from "./WalletInfo";

describe("WalletInfo", () => {
  it("renders disconnected wallet state", () => {
    render(
      <WalletInfo
        isConnected={false}
        balance={2}
        onSetStakeAmount={vi.fn()}
        onSetFormattedStakeAmount={vi.fn()}
      />
    );

    expect(screen.getByText("Not Connected")).toBeInTheDocument();
    expect(screen.queryByText("Disconnect")).not.toBeInTheDocument();
  });

  it("renders connected wallet state", () => {
    render(
      <WalletInfo
        isConnected
        address="wallet-address"
        balance={2}
        onSetStakeAmount={vi.fn()}
        onSetFormattedStakeAmount={vi.fn()}
      />
    );

    expect(screen.getByText("short-wallet")).toBeInTheDocument();
    expect(screen.getByText("Disconnect")).toBeInTheDocument();
  });

  it("sets half of available stake amount", async () => {
    const onSetStakeAmount = vi.fn();
    const onSetFormattedStakeAmount = vi.fn();
    render(
      <WalletInfo
        isConnected
        address="wallet-address"
        balance={10}
        onSetStakeAmount={onSetStakeAmount}
        onSetFormattedStakeAmount={onSetFormattedStakeAmount}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Half" }));

    expect(onSetStakeAmount).toHaveBeenCalledWith("4.996499");
    expect(onSetFormattedStakeAmount).toHaveBeenCalledWith("4.996499");
  });

  it("sets max available stake amount and floors low balances at zero", async () => {
    const onSetStakeAmount = vi.fn();
    const onSetFormattedStakeAmount = vi.fn();
    const { rerender } = render(
      <WalletInfo
        isConnected
        address="wallet-address"
        balance={10}
        onSetStakeAmount={onSetStakeAmount}
        onSetFormattedStakeAmount={onSetFormattedStakeAmount}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "MAX" }));
    expect(onSetStakeAmount).toHaveBeenLastCalledWith("9.996500");
    expect(onSetFormattedStakeAmount).toHaveBeenLastCalledWith("9.9965");

    rerender(
      <WalletInfo
        isConnected
        address="wallet-address"
        balance={0.001}
        onSetStakeAmount={onSetStakeAmount}
        onSetFormattedStakeAmount={onSetFormattedStakeAmount}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "MAX" }));

    expect(onSetStakeAmount).toHaveBeenLastCalledWith("0.000000");
    expect(onSetFormattedStakeAmount).toHaveBeenLastCalledWith("0");
  });
});
