import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchLSTBalanceMock, fetchVaultManageMock, infoMock, useStakeFormMock } = vi.hoisted(() => ({ fetchLSTBalanceMock: vi.fn(), fetchVaultManageMock: vi.fn(), infoMock: vi.fn(), useStakeFormMock: vi.fn() }));
vi.mock("@solana/webcrypto-ed25519-polyfill", () => ({ install: vi.fn() }));
vi.mock("@radix-ui/themes", () => ({ Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("../../hooks/useStakeForm", () => ({ useStakeForm: useStakeFormMock }));
vi.mock("../../utils/api", () => ({ fetchLSTBalance: fetchLSTBalanceMock, fetchVaultManage: fetchVaultManageMock }));
vi.mock("../../utils/imageUrl", () => ({ getImageUrl: vi.fn((src: string) => src) }));
vi.mock("../WalletConnectButton", () => ({ WalletConnectButton: () => <button type="button">Connect Wallet</button> }));
vi.mock("./StakeInputSection", () => ({ StakeInputSection: ({ stakeMode }: { stakeMode?: string }) => <div>Stake input {stakeMode}</div> }));
vi.mock("./StakeButtonVault2", () => ({ StakeButtonVault2: () => <button type="button">Vault Stake Button</button> }));
vi.mock("./NoWalletTable", () => ({ NoWalletTable: () => <div>No Wallet Table</div> }));
vi.mock("./VaultBindingBlock", () => ({ VaultBindingBlock: ({ data }: { data: { uiStatus?: string } | null }) => <div>Vault Binding {data?.uiStatus ?? "none"}</div> }));
vi.mock("./StakeLayout", () => ({ StakeLayout: ({ stakeChildren, manageChildren, onManageOpen }: { stakeChildren: React.ReactNode; manageChildren: React.ReactNode; onManageOpen?: () => void }) => <div><section>{stakeChildren}</section><button type="button" onClick={onManageOpen}>Open Manage</button><section>{manageChildren}</section></div> }));

import { StakeFormVault2 } from "./StakeFormVault2";

function mockStakeForm(overrides = {}) {
  useStakeFormMock.mockReturnValue({ selectedWalletAccount: undefined, network: "mainnet", isConnected: false, balance: 0, stakeAmount: "", formattedStakeAmount: "", setStakeAmount: vi.fn(), setFormattedStakeAmount: vi.fn(), handleInputChange: vi.fn(), resetFormAndRefreshBalance: vi.fn(), inSufficientBalance: false, ...overrides });
}

describe("StakeFormVault2", () => {
  beforeEach(() => {
    infoMock.mockClear();
    vi.spyOn(console, "info").mockImplementation(infoMock);
    fetchLSTBalanceMock.mockReset().mockResolvedValue(4);
    fetchVaultManageMock.mockReset().mockResolvedValue({ binding: { hasBinding: true }, stakebot: { found: true }, uiStatus: "ready" });
  });

  it("renders devnet unsupported state", () => {
    mockStakeForm({ network: "devnet" });
    render(<StakeFormVault2 validatorInfo={null} secondsRemainToEpochEnd={100} />);
    expect(screen.getByText("The Vault only works in the mainnet cluster")).toBeInTheDocument();
  });

  it("renders disconnected mainnet state", () => {
    mockStakeForm();
    render(<StakeFormVault2 validatorInfo={null} secondsRemainToEpochEnd={100} />);
    expect(screen.getByText("Stake input vault")).toBeInTheDocument();
    expect(screen.getAllByText("Connect Wallet")).toHaveLength(2);
    expect(screen.getByText("No Wallet Table")).toBeInTheDocument();
  });

  it("loads vault data for a connected mainnet wallet and refreshes on manage open", async () => {
    mockStakeForm({ selectedWalletAccount: { address: "wallet" }, isConnected: true, balance: 10 });
    render(<StakeFormVault2 validatorInfo={{ name: "Validator" } as never} secondsRemainToEpochEnd={100} />);
    expect(screen.getByText("Vault Stake Button")).toBeInTheDocument();
    await waitFor(() => expect(fetchLSTBalanceMock).toHaveBeenCalledWith("wallet", "mainnet", expect.any(String)));
    await waitFor(() => expect(fetchVaultManageMock).toHaveBeenCalledWith("wallet", "mainnet"));
    await waitFor(() => expect(screen.getByText("Vault Binding ready")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Open Manage" }));
    await waitFor(() => expect(fetchVaultManageMock).toHaveBeenCalledTimes(2));
    expect(infoMock).toHaveBeenCalled();
  });
});
