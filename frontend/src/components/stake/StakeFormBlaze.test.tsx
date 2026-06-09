import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchLSTBalanceMock, useStakeFormMock } = vi.hoisted(() => ({ fetchLSTBalanceMock: vi.fn(), useStakeFormMock: vi.fn() }));
vi.mock("@solana/webcrypto-ed25519-polyfill", () => ({ install: vi.fn() }));
vi.mock("../../hooks/useStakeForm", () => ({ useStakeForm: useStakeFormMock }));
vi.mock("../../utils/api", () => ({ fetchLSTBalance: fetchLSTBalanceMock }));
vi.mock("../WalletConnectButton", () => ({ WalletConnectButton: () => <button type="button">Connect Wallet</button> }));
vi.mock("./StakeLayout", () => ({ StakeLayout: ({ stakeChildren, manageChildren }: { stakeChildren: React.ReactNode; manageChildren: React.ReactNode }) => <div><section>{stakeChildren}</section><section>{manageChildren}</section></div> }));
vi.mock("./StakeInputSection", () => ({ StakeInputSection: ({ stakeMode }: { stakeMode?: string }) => <div>Stake input {stakeMode}</div> }));
vi.mock("./StakeButtonBlaze", () => ({ StakeButtonBlaze: () => <button type="button">Blaze Stake Button</button> }));
vi.mock("./NoWalletTable", () => ({ NoWalletTable: () => <div>No Wallet Table</div> }));
vi.mock("./BSOLBalanceTable2", () => ({ BSOLBalanceTable2: ({ bSOLBalance, isLoading, appliedStakes, showValidatorPlaceholder }: { bSOLBalance: number; isLoading: boolean; appliedStakes: unknown[]; showValidatorPlaceholder: boolean }) => <div data-testid="bsol-table">{String(bSOLBalance) + ":" + String(isLoading) + ":" + String(appliedStakes.length) + ":" + String(showValidatorPlaceholder)}</div> }));

import { StakeFormBlaze } from "./StakeFormBlaze";

function mockStakeForm(overrides = {}) {
  useStakeFormMock.mockReturnValue({ selectedWalletAccount: undefined, network: "devnet", isConnected: false, balance: 0, stakeAmount: "", formattedStakeAmount: "", setStakeAmount: vi.fn(), setFormattedStakeAmount: vi.fn(), handleInputChange: vi.fn(), resetFormAndRefreshBalance: vi.fn(), inSufficientBalance: false, ...overrides });
}

describe("StakeFormBlaze", () => {
  beforeEach(() => {
    fetchLSTBalanceMock.mockReset().mockResolvedValue(3.5);
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ json: () => Promise.resolve({ success: true, applied_stakes: { vote: 12 } }) })));
  });

  it("renders disconnected state", () => {
    mockStakeForm();
    render(<StakeFormBlaze validatorInfo={null} secondsRemainToEpochEnd={100} />);
    expect(screen.getByText("Stake input blaze")).toBeInTheDocument();
    expect(screen.getAllByText("Connect Wallet")).toHaveLength(2);
    expect(screen.getByText("No Wallet Table")).toBeInTheDocument();
  });

  it("renders connected devnet table without external applied stake fetch", async () => {
    mockStakeForm({ selectedWalletAccount: { address: "wallet" }, isConnected: true });
    render(<StakeFormBlaze validatorInfo={{ name: "Validator" } as never} secondsRemainToEpochEnd={100} />);
    expect(screen.getByText("Blaze Stake Button")).toBeInTheDocument();
    await waitFor(() => expect(fetchLSTBalanceMock).toHaveBeenCalledWith("wallet", "devnet", expect.any(String)));
    await waitFor(() => expect(screen.getByTestId("bsol-table")).toHaveTextContent("3.5:false:0:true"));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("loads applied stakes on mainnet", async () => {
    mockStakeForm({ selectedWalletAccount: { address: "wallet" }, isConnected: true, network: "mainnet" });
    render(<StakeFormBlaze validatorInfo={{ name: "Validator" } as never} secondsRemainToEpochEnd={100} />);
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("https://stake.solblaze.org/api/v1/cls_applied_user_stake?address=wallet"));
    await waitFor(() => expect(screen.getByTestId("bsol-table")).toHaveTextContent("3.5:false:1:false"));
  });
});
