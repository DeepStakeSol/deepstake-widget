import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { hideStakingModalMock, showStakingModalMock } = vi.hoisted(() => ({
  hideStakingModalMock: vi.fn(),
  showStakingModalMock: vi.fn(),
}));

vi.mock("@radix-ui/themes", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  Flex: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("../../context/StakingModalContext", () => ({
  useStakingModal: () => ({
    hideStakingModal: hideStakingModalMock,
    showStakingModal: showStakingModalMock,
  }),
}));

vi.mock("../ErrorDialog", () => ({
  ErrorDialog: ({ title, error }: { title: string; error: unknown }) => (
    <div role="alert">{title + ":" + (error instanceof Error ? error.message : String(error))}</div>
  ),
}));

import { StakeButtonBase } from "./StakeButtonBase";

describe("StakeButtonBase", () => {
  beforeEach(() => {
    hideStakingModalMock.mockClear();
    showStakingModalMock.mockClear();
  });

  it("renders the button and calls submit", async () => {
    const handleSubmit = vi.fn();
    render(
      <StakeButtonBase
        buttonLabel="Stake"
        disableStakeButton={false}
        isSendingTransaction={false}
        handleSubmit={handleSubmit}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Stake" }));

    expect(handleSubmit).toHaveBeenCalled();
    expect(hideStakingModalMock).toHaveBeenCalled();
  });

  it("disables the button and shows staking modal while sending", () => {
    render(
      <StakeButtonBase
        buttonLabel="Confirming Transaction"
        disableStakeButton
        isSendingTransaction
        handleSubmit={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Confirming Transaction" })).toBeDisabled();
    expect(showStakingModalMock).toHaveBeenCalled();
  });

  it("renders children and an error dialog", () => {
    render(
      <StakeButtonBase
        buttonLabel="Stake"
        disableStakeButton={false}
        isSendingTransaction={false}
        handleSubmit={vi.fn()}
        error={new Error("boom")}
      >
        <span>extra content</span>
      </StakeButtonBase>
    );

    expect(screen.getByText("extra content")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Staking failed:boom");
  });
});
