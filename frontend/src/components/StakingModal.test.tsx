import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { StakingModal } from "./StakingModal";

const { hideSuccessModalMock, onCloseMock } = vi.hoisted(() => ({
  hideSuccessModalMock: vi.fn(),
  onCloseMock: vi.fn(),
}));

vi.mock("../context/StakingModalContext", () => ({
  useStakingModal: () => ({
    isShowing: false,
    isTransactionShowing: false,
    successData: {
      title: "Congratulations!",
      message: "Your stake has been activated.",
      signature: "sig-shared",
      onClose: onCloseMock,
    },
    hideSuccessModal: hideSuccessModalMock,
  }),
}));

describe("StakingModal", () => {
  beforeEach(() => {
    hideSuccessModalMock.mockClear();
    onCloseMock.mockClear();
  });

  it("anchors the success close button directly to the modal", async () => {
    const user = userEvent.setup();
    render(
      <div data-widget="deepstake" data-theme="dark">
        <StakingModal />
      </div>,
    );

    const modal = screen.getByRole("alertdialog");
    const closeButton = screen.getByRole("button", { name: "Close success dialog" });

    expect(closeButton.parentElement).toBe(modal);
    expect(closeButton).toHaveStyle({
      position: "absolute",
      top: "15px",
      right: "15px",
    });

    await user.click(closeButton);

    expect(onCloseMock).toHaveBeenCalledOnce();
    expect(hideSuccessModalMock).toHaveBeenCalledOnce();
  });

  // Regression for J2-4: the JPool tab has its own completion dialog; the shared
  // success modal used by Native, Blaze, Vault, Unstake and Withdraw is unchanged.
  it("keeps the shared success modal layout for the other tabs", () => {
    render(
      <div data-widget="deepstake">
        <StakingModal />
      </div>,
    );

    const modal = screen.getByRole("alertdialog");
    expect(modal).toHaveTextContent("Congratulations!");
    expect(modal).toHaveTextContent("Your stake has been activated.");
    expect(screen.getByAltText("staking logo")).toBeInTheDocument();
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["Explorer", "Solscan", "Orb"]);
    links.forEach((link) => expect(link.getAttribute("href")).toContain("sig-shared"));
  });
});
