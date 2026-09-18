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
});
