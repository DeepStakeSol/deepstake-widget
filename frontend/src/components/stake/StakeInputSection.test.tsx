import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../utils/imageUrl", () => ({
  getImageUrl: vi.fn((src: string) => src),
}));

vi.mock("./WalletInfo", () => ({
  WalletInfo: ({ isConnected, address }: { isConnected: boolean; address?: string }) => (
    <div data-testid="wallet-info">{isConnected ? address : "not-connected"}</div>
  ),
}));

vi.mock("./WalletBalance", () => ({
  WalletBalance: ({ balance, stakeMode }: { balance: number; stakeMode?: string }) => (
    <div data-testid="wallet-balance">{String(balance) + ":" + stakeMode}</div>
  ),
}));

import { StakeInputSection } from "./StakeInputSection";

describe("StakeInputSection", () => {
  it("renders wallet, input, SOL label, and balance information", () => {
    render(
      <StakeInputSection
        isConnected
        selectedWalletAddress="wallet-address"
        balance={3}
        formattedStakeAmount="1.23"
        onInputChange={vi.fn()}
        onSetStakeAmount={vi.fn()}
        onSetFormattedStakeAmount={vi.fn()}
        validatorInfo={null}
        secondsRemainToEpochEnd={10}
        stakeMode="blaze"
      />
    );

    expect(screen.getByTestId("wallet-info")).toHaveTextContent("wallet-address");
    expect(screen.getByLabelText("Stake Amount")).toHaveValue("1.23");
    expect(screen.getByText("SOL")).toBeInTheDocument();
    expect(screen.getByTestId("wallet-balance")).toHaveTextContent("3:blaze");
  });

  it("calls onInputChange when the amount is edited", async () => {
    const onInputChange = vi.fn();
    render(
      <StakeInputSection
        isConnected={false}
        balance={0}
        formattedStakeAmount=""
        onInputChange={onInputChange}
        onSetStakeAmount={vi.fn()}
        onSetFormattedStakeAmount={vi.fn()}
        validatorInfo={null}
        secondsRemainToEpochEnd={10}
      />
    );

    await userEvent.type(screen.getByLabelText("Stake Amount"), "12");

    expect(onInputChange).toHaveBeenCalled();
  });
});
