import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchStakeAccountsMock, fetchStakeMinimumMock, useStakeFormMock } = vi.hoisted(() => ({
  fetchStakeAccountsMock: vi.fn(),
  fetchStakeMinimumMock: vi.fn(),
  useStakeFormMock: vi.fn(),
}));

vi.mock("@solana/webcrypto-ed25519-polyfill", () => ({
  install: vi.fn(),
}));

vi.mock("../../hooks/useStakeForm", () => ({
  useStakeForm: useStakeFormMock,
}));

vi.mock("../../utils/api", () => ({
  fetchStakeAccounts: fetchStakeAccountsMock,
  fetchStakeMinimum: fetchStakeMinimumMock,
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
  StakeInputSection: ({ selectedWalletAddress, minimumStakeLamports, isMinimumLoading }: { selectedWalletAddress?: string; minimumStakeLamports?: number; isMinimumLoading?: boolean }) => (
    <div
      data-testid="stake-input"
      data-minimum={minimumStakeLamports}
      data-loading={String(Boolean(isMinimumLoading))}
    >
      {selectedWalletAddress ?? "no-wallet"}
    </div>
  ),
}));

vi.mock("./StakeButton", () => ({
  StakeButton: ({ minimumStakeLamports, isMinimumLoading }: { minimumStakeLamports?: number; isMinimumLoading?: boolean }) => (
    <button
      type="button"
      data-minimum={minimumStakeLamports}
      data-loading={String(Boolean(isMinimumLoading))}
    >
      Stake Button
    </button>
  ),
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
    fetchStakeAccountsMock.mockReset();
    fetchStakeMinimumMock.mockReset().mockResolvedValue({
      network: "devnet",
      minimumStakeLamports: 1_002_282_880,
      minimumStakeSol: 1.00228288,
      minimumDelegation: 1_000_000_000,
      rentExemptReserve: 2_282_880,
    });
  });

  it("renders disconnected wallet state", () => {
    mockStakeForm();

    render(<StakeForm currentEpoch={1} validatorInfo={null} secondsRemainToEpochEnd={100} />);

    expect(screen.getByTestId("stake-input")).toHaveTextContent("no-wallet");
    expect(screen.getAllByText("Connect Wallet")).toHaveLength(2);
    expect(screen.getByText("No Wallet Table")).toBeInTheDocument();
  });

  it("renders no accounts state for a connected wallet without stake accounts", async () => {
    mockStakeForm({
      selectedWalletAccount: { address: "wallet-address" },
      isConnected: true,
    });

    render(<StakeForm currentEpoch={1} validatorInfo={null} secondsRemainToEpochEnd={100} />);

    expect(screen.getByText("Stake Button")).toBeInTheDocument();
    expect(screen.getByText("No Accounts Table")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId("stake-input")).toHaveAttribute(
        "data-minimum",
        "1002282880"
      )
    );
    expect(screen.getByRole("button", { name: "Stake Button" })).toHaveAttribute(
      "data-minimum",
      "1002282880"
    );
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
