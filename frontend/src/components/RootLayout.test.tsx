import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../context/SelectedWalletContextProvider", () => ({ SelectedWalletContextProvider: ({ children }: { children: React.ReactNode }) => <div data-testid="wallet-provider">{children}</div> }));
vi.mock("../context/BalanceCheckProvider", () => ({ BalanceCheckProvider: ({ children }: { children: React.ReactNode }) => <div data-testid="balance-provider">{children}</div> }));
vi.mock("../context/StakingModalContext", () => ({ StakingModalProvider: ({ children }: { children: React.ReactNode }) => <div data-testid="staking-provider">{children}</div> }));
vi.mock("@radix-ui/themes", () => ({ Section: ({ children }: { children: React.ReactNode }) => <section>{children}</section>, Theme: ({ children }: { children: React.ReactNode }) => <div data-testid="theme">{children}</div> }));
vi.mock("./NetworkLabel", () => ({ NetworkLabel: () => <div>Network Label</div> }));
vi.mock("./StakingModal", () => ({ StakingModal: () => <div>Staking Modal</div> }));
vi.mock("./WalletModal", () => ({ WalletModal: () => <div>Wallet Modal</div> }));

import RootLayout from "./RootLayout";

describe("RootLayout", () => {
  it("renders providers, layout chrome, modals, and children", () => {
    render(<RootLayout><div>Widget content</div></RootLayout>);
    expect(screen.getByTestId("theme")).toBeInTheDocument();
    expect(screen.getByTestId("wallet-provider")).toBeInTheDocument();
    expect(screen.getByTestId("balance-provider")).toBeInTheDocument();
    expect(screen.getByTestId("staking-provider")).toBeInTheDocument();
    expect(screen.getByText("Network Label")).toBeInTheDocument();
    expect(screen.getByText("Widget content")).toBeInTheDocument();
    expect(screen.getByText("Staking Modal")).toBeInTheDocument();
    expect(screen.getByText("Wallet Modal")).toBeInTheDocument();
  });
});
