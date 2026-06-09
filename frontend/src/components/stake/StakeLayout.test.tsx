import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("@radix-ui/themes", () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Flex: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { StakeLayout } from "./StakeLayout";

describe("StakeLayout", () => {
  it("renders stake and manage tabs and calls onManageOpen", async () => {
    const onManageOpen = vi.fn();
    render(
      <StakeLayout
        stakeChildren={<div>stake content</div>}
        manageChildren={<div>manage content</div>}
        onManageOpen={onManageOpen}
      />
    );

    expect(screen.getByText("Your stake")).toBeInTheDocument();
    expect(screen.getByText("stake content")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Manage"));

    expect(onManageOpen).toHaveBeenCalled();
    expect(screen.getByText("manage content")).toBeInTheDocument();
  });
});
