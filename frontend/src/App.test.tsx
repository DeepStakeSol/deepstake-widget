import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  applyValidatorLogoMock,
  applyValidatorOverridesMock,
  createUnavailableValidatorProfileMock,
  fetchEpochInfoMock,
  fetchPerfSamplesMock,
  fetchValidatorLogoMock,
  fetchValidatorProfileMock,
  prefetchManageDataMock,
  useNetworkMock,
  useOptionsMock,
} = vi.hoisted(() => ({
  applyValidatorLogoMock: vi.fn((profile, logo) => ({
    ...profile,
    logoUrl: logo?.logoUrl ?? profile.logoUrl,
  })),
  applyValidatorOverridesMock: vi.fn((profile, options) => ({
    ...profile,
    name: options?.validator_name ?? profile.name,
    description: options?.validator_description ?? profile.description,
    logoUrl: options?.validator_logo_url ?? profile.logoUrl,
  })),
  createUnavailableValidatorProfileMock: vi.fn((voteAccount, network) => ({
    voteAccount,
    network,
    name: null,
    description: null,
    logoUrl: null,
    status: "unavailable",
  })),
  fetchEpochInfoMock: vi.fn(),
  fetchPerfSamplesMock: vi.fn(),
  fetchValidatorLogoMock: vi.fn(),
  fetchValidatorProfileMock: vi.fn(),
  prefetchManageDataMock: vi.fn(),
  useNetworkMock: vi.fn(),
  useOptionsMock: vi.fn(),
}));

vi.mock("@radix-ui/themes", () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Flex: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("./components/RootLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="root-layout">{children}</div>
  ),
}));
vi.mock("./components/TitleHeader", () => ({
  TitleHeader: ({ progress, currentEpoch, secondsRemainToEpochEnd }: {
    progress: number;
    currentEpoch: number;
    secondsRemainToEpochEnd: number;
  }) => (
    <div data-testid="title-header">
      {String(progress) + ":" + String(currentEpoch) + ":" + String(secondsRemainToEpochEnd)}
    </div>
  ),
}));
vi.mock("./components/stake/ValidatorInfo", () => ({
  ValidatorInfo: ({ validatorInfo }: { validatorInfo: { name?: string | null; logoUrl?: string | null } | null }) => (
    <div data-testid="validator-info">
      {(validatorInfo?.name ?? "no-validator") + ":" + (validatorInfo?.logoUrl ?? "no-logo")}
    </div>
  ),
}));
vi.mock("./components/stake/StakeForm", () => ({ StakeForm: () => <div>Native form</div> }));
vi.mock("./components/stake/StakeFormBlaze", () => ({ StakeFormBlaze: () => <div>Blaze form</div> }));
vi.mock("./components/stake/StakeFormVault2", () => ({
  StakeFormVault2: ({ voteAccount }: { voteAccount: string }) => (
    <div data-vote-account={voteAccount}>Vault form</div>
  ),
}));
vi.mock("./context/NetworkContext", () => ({ useNetwork: useNetworkMock }));
vi.mock("./options", () => ({ useOptions: useOptionsMock }));
vi.mock("./utils/solana/validator", () => ({
  applyValidatorLogo: applyValidatorLogoMock,
  applyValidatorOverrides: applyValidatorOverridesMock,
  createUnavailableValidatorProfile: createUnavailableValidatorProfileMock,
  fetchValidatorLogo: fetchValidatorLogoMock,
  fetchValidatorProfile: fetchValidatorProfileMock,
  isLegacyValidatorProfileEnabled: vi.fn(() => false),
}));
vi.mock("./utils/api", () => ({
  fetchEpochInfo: fetchEpochInfoMock,
  fetchPerfSamples: fetchPerfSamplesMock,
}));
vi.mock("./utils/imageUrl", () => ({
  cssImageUrl: vi.fn((src: string) => 'url("' + src + '")'),
}));
vi.mock("./utils/managePrefetch", () => ({
  prefetchManageData: prefetchManageDataMock,
}));

import App from "./App";
import { SelectedWalletAccountContext } from "./context/SelectedWalletAccountContext";

const profile = {
  name: "Validator",
  logoUrl: "https://logo.example/logo.png",
  voteAccount: "vote-address",
  network: "devnet",
};

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    useNetworkMock.mockReturnValue({ network: "devnet" });
    useOptionsMock.mockReturnValue({ vote_account: "vote-address" });
    fetchValidatorProfileMock.mockResolvedValue(profile);
    fetchValidatorLogoMock.mockResolvedValue({
      network: "devnet",
      voteAccount: "vote-address",
      logoUrl: "https://logo.example/logo.png",
      status: "fresh",
      field: { source: "trillium", observedAt: null, stale: false },
    });
    fetchEpochInfoMock.mockResolvedValue({
      epochInfo: { epoch: 42, slotIndex: 25, slotsInEpoch: 100 },
    });
    fetchPerfSamplesMock.mockResolvedValue({
      sample: { numSlots: 10, samplePeriodSecs: 5 },
    });
    prefetchManageDataMock.mockResolvedValue(undefined);
  });

  it("renders all tabs and fetches one validator profile", async () => {
    render(<App />);
    expect(screen.getByRole("tab", { name: /Native/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /BlazeStake/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Vault/ })).toBeInTheDocument();

    await waitFor(() =>
      expect(fetchValidatorProfileMock).toHaveBeenCalledWith("vote-address", "devnet")
    );
    expect(fetchValidatorProfileMock).toHaveBeenCalledTimes(1);
    expect(fetchValidatorLogoMock).toHaveBeenCalledWith("vote-address", "devnet");
    await waitFor(() =>
      expect(screen.getByTestId("validator-info")).toHaveTextContent(
        "Validator:https://logo.example/logo.png"
      )
    );
    await waitFor(() =>
      expect(screen.getByTestId("title-header")).toHaveTextContent("25:42:37.5")
    );
  });

  it("renders profile data while the logo request is still pending", async () => {
    fetchValidatorProfileMock.mockResolvedValueOnce({ ...profile, logoUrl: null });
    fetchValidatorLogoMock.mockReturnValueOnce(new Promise(() => undefined));
    render(<App />);

    await waitFor(() =>
      expect(screen.getByTestId("validator-info")).toHaveTextContent(
        "Validator:no-logo"
      )
    );
    expect(fetchValidatorLogoMock).toHaveBeenCalledTimes(1);
  });

  it("filters tabs and switches between enabled tabs", async () => {
    useOptionsMock.mockReturnValue({
      vote_account: "vote-address",
      tabs: ["blaze", "vault"],
    });
    render(<App />);
    expect(screen.queryByRole("tab", { name: /Native/ })).not.toBeInTheDocument();
    expect(screen.getByText("Blaze form")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: /Vault/ }));
    expect(screen.getByText("Vault form")).toHaveAttribute("data-vote-account", "vote-address");
  });

  it("prefetches Manage data when a connected user shows tab intent", () => {
    const account = { address: "wallet-address" } as never;

    render(
      <SelectedWalletAccountContext.Provider value={[account, vi.fn()]}>
        <App />
      </SelectedWalletAccountContext.Provider>
    );

    fireEvent.pointerEnter(screen.getByRole("tab", { name: /BlazeStake/ }));

    expect(prefetchManageDataMock).toHaveBeenCalledWith(
      "blaze",
      "wallet-address",
      "devnet"
    );
  });

  it("prefetches inactive providers sequentially during idle time", async () => {
    vi.useFakeTimers();
    useNetworkMock.mockReturnValue({ network: "mainnet" });
    const account = { address: "wallet-address" } as never;
    let resolveBlaze!: () => void;
    prefetchManageDataMock.mockImplementation((provider: string) => {
      if (provider === "blaze") {
        return new Promise<void>((resolve) => {
          resolveBlaze = resolve;
        });
      }
      return Promise.resolve();
    });
    vi.stubGlobal("requestIdleCallback", (callback: IdleRequestCallback) => {
      callback({ didTimeout: false, timeRemaining: () => 50 });
      return 1;
    });

    const { unmount } = render(
      <SelectedWalletAccountContext.Provider value={[account, vi.fn()]}>
        <App />
      </SelectedWalletAccountContext.Provider>
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(prefetchManageDataMock).toHaveBeenCalledTimes(1);
    expect(prefetchManageDataMock).toHaveBeenNthCalledWith(
      1,
      "blaze",
      "wallet-address",
      "mainnet"
    );

    await act(async () => {
      resolveBlaze();
      await Promise.resolve();
    });
    expect(prefetchManageDataMock).toHaveBeenNthCalledWith(
      2,
      "vault",
      "wallet-address",
      "mainnet"
    );

    unmount();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("does not fetch without a vote account", () => {
    useOptionsMock.mockReturnValue(null);
    render(<App />);
    expect(fetchValidatorProfileMock).not.toHaveBeenCalled();
    expect(fetchValidatorLogoMock).not.toHaveBeenCalled();
    expect(fetchEpochInfoMock).not.toHaveBeenCalled();
  });

  it("applies embedder identity overrides", async () => {
    useOptionsMock.mockReturnValue({
      vote_account: "vote-address",
      validator_name: "Host validator",
      validator_logo_url: "https://host.example/logo.png",
    });
    render(<App />);

    await waitFor(() =>
      expect(screen.getByTestId("validator-info")).toHaveTextContent(
        "Host validator:https://host.example/logo.png"
      )
    );
    expect(fetchValidatorLogoMock).not.toHaveBeenCalled();
    expect(applyValidatorOverridesMock).toHaveBeenCalledWith(
      profile,
      expect.objectContaining({ validator_name: "Host validator" })
    );
  });

  it("keeps the current profile visible during a same-validator refresh", async () => {
    const { rerender } = render(<App />);
    await waitFor(() =>
      expect(screen.getByTestId("validator-info")).toHaveTextContent("Validator")
    );

    fetchValidatorProfileMock.mockReturnValueOnce(new Promise(() => undefined));
    useOptionsMock.mockReturnValue({
      vote_account: "vote-address",
      validator_description: "Updated host description",
    });
    rerender(<App />);

    expect(screen.getByTestId("validator-info")).toHaveTextContent("Validator");
  });

  it("ignores profile data returned after the vote account changes", async () => {
    let resolveOldRequest!: (value: typeof profile) => void;
    fetchValidatorProfileMock
      .mockReturnValueOnce(new Promise((resolve) => { resolveOldRequest = resolve; }))
      .mockResolvedValueOnce({ ...profile, name: "New validator", voteAccount: "new-vote" });

    const { rerender } = render(<App />);
    useOptionsMock.mockReturnValue({ vote_account: "new-vote" });
    rerender(<App />);

    await waitFor(() =>
      expect(screen.getByTestId("validator-info")).toHaveTextContent("New validator")
    );
    resolveOldRequest(profile);
    await Promise.resolve();
    expect(screen.getByTestId("validator-info")).not.toHaveTextContent("Validator:");
  });

  it("keeps staking usable and applies overrides when profile loading fails", async () => {
    useOptionsMock.mockReturnValue({
      vote_account: "vote-address",
      validator_name: "Host fallback",
    });
    fetchValidatorProfileMock.mockRejectedValue(new Error("profile failed"));
    fetchEpochInfoMock.mockRejectedValue(new Error("epoch failed"));
    render(<App />);

    expect(screen.getByText("Native form")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId("validator-info")).toHaveTextContent("Host fallback")
    );
    expect(createUnavailableValidatorProfileMock).toHaveBeenCalledWith(
      "vote-address",
      "devnet"
    );
  });
});
