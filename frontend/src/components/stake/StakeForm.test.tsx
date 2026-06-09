import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useStakeFormMock } = vi.hoisted(() => ({
  useStakeFormMock: vi.fn(),
}));

vi.mock("@solana/webcrypto-ed25519-polyfill", () => ({
  install: vi.fn(),
}));

vi.mock("../../hooks/useStakeForm", () => ({
  useStakeForm: useStakeFormMock,
}));

vi.mock("../WalletConnectButton", () => ({
  WalletConnectButton: () => <button type="button">Connect Wallet</button>,
}));

vi.mock("./StakeLayout", () => ({
  StakeLayout: ({ stakeChildren, manageChildren }: { stakeChildren: React.ReactNode; manageChildren: React.ReactNode }) => (
    <div>
      <section data-testid="stake-section">{stakeChildren}</section>
      <section data-testid="manage-section">{manageChildren}</section>
    </div>
  ),
}));

vi.mock("./StakeInputSection", () => ({
  StakeInputSection: ({ selectedWalletAddress }: { selectedWalletAddress?: string }) => (
    <div data-testid="stake-input">{selectedWalletAddress ?? "no-wallet"}</div>
  ),
}));

vi.mock("./StakeButton", () => ({
  StakeButton: () => <button type="button">Stake Button</button>,
}));

vi.mock("./StakeAccountsTable", () => ({
  StakeAccountsTable: () => <div>Stake Accounts Table</div>,
}));

vi.mock("./NoWalletTable", () => ({
  NoWalletTable: () => <div>No Wallet Table</div>,
}));

vi.mock("./NoAccountsTable", () => ({
  NoAccountsTable: () => <div>No Accounts Table</div>,
}));

import { StakeForm } from "./StakeForm";

function mockStakeForm(overrides = {}) {
  useStakeFormMock.mockReturnValue({
    selectedWalletAccount: undefined,
    network: "devnet",
    isConnected: false,
    balance: 0,
    stakeAmount: "",
    formattedStakeAmount: "",
    setStakeAmount: vi.fn(),
    setFormattedStakeAmount: vi.fn(),
    stakeAccounts: [],
    setStakeAccounts: vi.fn(),
    selectedRow: null,
    setSelectedRow: vi.fn(),
    handleInputChange: vi.fn(),
    resetFormAndRefreshBalance: vi.fn(),
    inSufficientBalance: false,
    ...overrides,
  });
}

describe("StakeForm", () => {
  beforeEach(() => {
    useStakeFormMock.mockReset();
  });

  it("renders disconnected wallet state", () => {
    mockStakeForm();

    render(<StakeForm currentEpoch={1} validatorInfo={null} secondsRemainToEpochEnd={100} />);

    expect(screen.getByTestId("stake-input")).toHaveTextContent("no-wallet");
    expect(screen.getAllByText("Connect Wallet")).toHaveLength(2);
    expect(screen.getByText("No Wallet Table")).toBeInTheDocument();
  });

  it("renders no accounts state for a connected wallet without stake accounts", () => {
    mockStakeForm({
      selectedWalletAccount: { address: "wallet-address" },
      isConnected: true,
    });

    render(<StakeForm currentEpoch={1} validatorInfo={null} secondsRemainToEpochEnd={100} />);

    expect(screen.getByText("Stake Button")).toBeInTheDocument();
    expect(screen.getByText("No Accounts Table")).toBeInTheDocument();
  });

  it("renders stake accounts table for a connected wallet with accounts", () => {
    mockStakeForm({
      selectedWalletAccount: { address: "wallet-address" },
      isConnected: true,
      stakeAccounts: [{ address: "stake-account" }],
    });

    render(<StakeForm currentEpoch={1} validatorInfo={null} secondsRemainToEpochEnd={100} />);

    expect(screen.getByText("Stake Accounts Table")).toBeInTheDocument();
  });
});
