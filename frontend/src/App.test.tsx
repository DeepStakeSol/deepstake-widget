import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  fetchJpoolEligibilityMock,
} = vi.hoisted(() => ({
  fetchJpoolEligibilityMock: vi.fn(),
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
vi.mock("./components/stake/StakeFormJpool", () => ({
  StakeFormJpool: ({ voteAccount }: { voteAccount: string }) => (
    <div data-vote-account={voteAccount}>JPool form</div>
  ),
}));
vi.mock("./utils/jpool", () => ({ fetchJpoolEligibility: fetchJpoolEligibilityMock }));
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
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    useNetworkMock.mockReturnValue({ network: "devnet" });
    useOptionsMock.mockReturnValue({ vote_account: "vote-address" });
    fetchValidatorProfileMock.mockResolvedValue(profile);
    fetchValidatorLogoMock.mockResolvedValue({
      network: "devnet",
      voteAccount: "vote-address",
      logoUrl: "https://logo.example/logo.png",
      status: "fresh",
      field: { source: "stakewiz", observedAt: null, stale: false },
    });
    fetchEpochInfoMock.mockResolvedValue({
      epochInfo: { epoch: 42, slotIndex: 25, slotsInEpoch: 100 },
    });
    fetchPerfSamplesMock.mockResolvedValue({
      sample: { numSlots: 10, samplePeriodSecs: 5 },
    });
    prefetchManageDataMock.mockResolvedValue(undefined);
  });

  it("renders only supported devnet tabs, warns, and fetches one validator profile", async () => {
    render(<App />);
    expect(screen.getByRole("tab", { name: /Native/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /BlazeStake/ })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Vault/ })).not.toBeInTheDocument();

    await waitFor(() =>
      expect(console.warn).toHaveBeenCalledWith(
        "[DeepStake widget] Vault is unavailable on devnet and was hidden"
      )
    );
    expect(console.warn).toHaveBeenCalledTimes(1);
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

  it("filters and switches between enabled mainnet tabs", async () => {
    useNetworkMock.mockReturnValue({ network: "mainnet" });
    useOptionsMock.mockReturnValue({
      vote_account: "vote-address",
      tabs: ["blaze", "vault"],
    });
    render(<App />);
    expect(screen.queryByRole("tab", { name: /Native/ })).not.toBeInTheDocument();
    expect(screen.getByText("Blaze form")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: /Vault/ }));
    expect(screen.getByText("Vault form")).toHaveAttribute("data-vote-account", "vote-address");
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("hides and never prefetches a requested Vault tab on devnet", () => {
    useOptionsMock.mockReturnValue({
      vote_account: "vote-address",
      tabs: ["blaze", "vault"],
    });
    const account = { address: "wallet-address" } as never;

    render(
      <SelectedWalletAccountContext.Provider value={[account, vi.fn()]}>
        <App />
      </SelectedWalletAccountContext.Provider>
    );

    expect(screen.getByRole("tab", { name: /BlazeStake/ })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Vault/ })).not.toBeInTheDocument();
    expect(prefetchManageDataMock).toHaveBeenCalledWith(
      "blaze",
      "wallet-address",
      "devnet",
      "vote-address"
    );
    expect(prefetchManageDataMock).not.toHaveBeenCalledWith(
      "vault",
      "wallet-address",
      "devnet",
      "vote-address"
    );
  });

  it("shows a configuration error for a Vault-only devnet widget", async () => {
    useOptionsMock.mockReturnValue({
      vote_account: "vote-address",
      tabs: ["vault"],
    });

    render(<App />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "DeepStake widget: Vault is unavailable on devnet; configure at least one supported tab"
    );
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(fetchValidatorProfileMock).not.toHaveBeenCalled();
    await waitFor(() => expect(console.warn).toHaveBeenCalledTimes(1));
  });

  it("starts Manage prefetch when a wallet is restored after mount", () => {
    const setAccount = vi.fn();
    const { rerender } = render(
      <SelectedWalletAccountContext.Provider value={[undefined, setAccount]}>
        <App />
      </SelectedWalletAccountContext.Provider>
    );
    expect(prefetchManageDataMock).not.toHaveBeenCalled();

    const account = { address: "restored-wallet" } as never;
    rerender(
      <SelectedWalletAccountContext.Provider value={[account, setAccount]}>
        <App />
      </SelectedWalletAccountContext.Provider>
    );

    expect(prefetchManageDataMock).toHaveBeenCalledWith(
      "blaze",
      "restored-wallet",
      "devnet",
      "vote-address"
    );
  });

  it("prefetches Manage data immediately and tab intent does not issue another prefetch", () => {
    const account = { address: "wallet-address" } as never;

    render(
      <SelectedWalletAccountContext.Provider value={[account, vi.fn()]}>
        <App />
      </SelectedWalletAccountContext.Provider>
    );

    expect(prefetchManageDataMock).toHaveBeenCalledWith(
      "blaze",
      "wallet-address",
      "devnet",
      "vote-address"
    );

    prefetchManageDataMock.mockClear();
    fireEvent.pointerEnter(screen.getByRole("tab", { name: /BlazeStake/ }));
    fireEvent.pointerDown(screen.getByRole("tab", { name: /BlazeStake/ }));
    fireEvent.focus(screen.getByRole("tab", { name: /BlazeStake/ }));
    expect(prefetchManageDataMock).not.toHaveBeenCalled();
  });

  it("starts enabled Blaze and Vault prefetches in parallel on mainnet", () => {
    useNetworkMock.mockReturnValue({ network: "mainnet" });
    const account = { address: "wallet-address" } as never;
    prefetchManageDataMock.mockReturnValue(new Promise(() => undefined));

    render(
      <SelectedWalletAccountContext.Provider value={[account, vi.fn()]}>
        <App />
      </SelectedWalletAccountContext.Provider>
    );

    expect(prefetchManageDataMock).toHaveBeenCalledTimes(2);
    expect(prefetchManageDataMock).toHaveBeenNthCalledWith(
      1,
      "blaze",
      "wallet-address",
      "mainnet",
      "vote-address"
    );
    expect(prefetchManageDataMock).toHaveBeenNthCalledWith(
      2,
      "vault",
      "wallet-address",
      "mainnet",
      "vote-address"
    );
  });

  it("prefetches only enabled provider tabs", () => {
    useNetworkMock.mockReturnValue({ network: "mainnet" });
    useOptionsMock.mockReturnValue({
      vote_account: "vote-address",
      tabs: ["native", "blaze"],
    });
    const account = { address: "wallet-address" } as never;

    render(
      <SelectedWalletAccountContext.Provider value={[account, vi.fn()]}>
        <App />
      </SelectedWalletAccountContext.Provider>
    );

    expect(prefetchManageDataMock).toHaveBeenCalledTimes(1);
    expect(prefetchManageDataMock).toHaveBeenCalledWith(
      "blaze",
      "wallet-address",
      "mainnet",
      "vote-address"
    );
  });

  it("does not fetch without a vote account", () => {
    useOptionsMock.mockReturnValue(null);
    render(<App />);
    expect(fetchValidatorProfileMock).not.toHaveBeenCalled();
    expect(fetchValidatorLogoMock).not.toHaveBeenCalled();
    expect(fetchEpochInfoMock).not.toHaveBeenCalled();
    expect(prefetchManageDataMock).not.toHaveBeenCalled();
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

  describe("JPool tab", () => {
    const eligible = { eligible: true, reason: null, epoch: 1045, source: "jpool" };

    function deferred<T>() {
      let resolve!: (value: T) => void;
      const promise = new Promise<T>((r) => (resolve = r));
      return { promise, resolve };
    }

    beforeEach(() => {
      useNetworkMock.mockReturnValue({ network: "mainnet" });
      fetchJpoolEligibilityMock.mockResolvedValue(eligible);
    });

    it("does not check eligibility when JPool is not requested", () => {
      render(<App />);
      expect(fetchJpoolEligibilityMock).not.toHaveBeenCalled();
      expect(screen.queryByRole("tab", { name: /JPool/ })).not.toBeInTheDocument();
    });

    it("shows the tab only after an eligible answer, with four narrow tabs", async () => {
      const answer = deferred<typeof eligible>();
      fetchJpoolEligibilityMock.mockReturnValue(answer.promise);
      useOptionsMock.mockReturnValue({
        vote_account: "vote-address",
        tabs: ["native", "blaze", "vault", "jpool"],
      });

      render(<App />);
      expect(screen.getAllByRole("tab")).toHaveLength(3);
      expect(screen.queryByRole("tab", { name: /JPool/ })).not.toBeInTheDocument();
      expect(fetchJpoolEligibilityMock).toHaveBeenCalledWith("vote-address", "mainnet", {
        signal: expect.any(AbortSignal),
      });

      answer.resolve(eligible);
      const jpoolTab = await screen.findByRole("tab", { name: /JPool/ });
      expect(screen.getAllByRole("tab")).toHaveLength(4);
      expect(screen.getByRole("tablist")).toHaveClass("sw-tabs-4");
      expect(screen.getByRole("tab", { name: /Native/ })).toHaveAttribute("data-state", "active");

      await userEvent.click(jpoolTab);
      expect(jpoolTab).toHaveAttribute("data-state", "active");
      expect(screen.getByText("JPool form")).toHaveAttribute("data-vote-account", "vote-address");
    });

    it("shows the tab on a fallback answer", async () => {
      fetchJpoolEligibilityMock.mockResolvedValue({
        eligible: true,
        reason: null,
        epoch: null,
        source: "fallback",
        clientFallback: "timeout",
      });
      useOptionsMock.mockReturnValue({ vote_account: "vote-address", tabs: ["native", "jpool"] });

      render(<App />);
      expect(await screen.findByRole("tab", { name: /JPool/ })).toBeInTheDocument();
      expect(screen.getByRole("tablist")).not.toHaveClass("sw-tabs-4");
    });

    it("hides an ineligible tab and logs the reason", async () => {
      fetchJpoolEligibilityMock.mockResolvedValue({
        eligible: false,
        reason: "superminority",
        epoch: 1045,
        source: "jpool",
      });
      useOptionsMock.mockReturnValue({ vote_account: "vote-address", tabs: ["native", "jpool"] });

      render(<App />);
      await waitFor(() =>
        expect(console.warn).toHaveBeenCalledWith(
          "[DeepStake widget] JPool tab hidden: superminority"
        )
      );
      expect(screen.queryByRole("tab", { name: /JPool/ })).not.toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /Native/ })).toBeInTheDocument();
    });

    it("shows a compact loader for a JPool-only widget until eligibility resolves", async () => {
      const answer = deferred<typeof eligible>();
      fetchJpoolEligibilityMock.mockReturnValue(answer.promise);
      useOptionsMock.mockReturnValue({ vote_account: "vote-address", tabs: ["jpool"] });

      render(<App />);
      expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
      expect(screen.queryByRole("tab")).not.toBeInTheDocument();

      answer.resolve(eligible);
      expect(await screen.findByRole("tab", { name: /JPool/ })).toHaveAttribute(
        "data-state",
        "active"
      );
      expect(screen.queryByRole("status", { name: "Loading" })).not.toBeInTheDocument();
    });

    it("explains an ineligible JPool-only widget", async () => {
      fetchJpoolEligibilityMock.mockResolvedValue({
        eligible: false,
        reason: "blocked",
        epoch: 1045,
        source: "jpool",
      });
      useOptionsMock.mockReturnValue({ vote_account: "vote-address", tabs: ["jpool"] });

      render(<App />);
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "DeepStake widget: JPool direct staking is unavailable for this validator"
      );
    });

    it("prefetches JPool Manage with the vote account once the tab is visible", async () => {
      useOptionsMock.mockReturnValue({ vote_account: "vote-address", tabs: ["native", "jpool"] });
      const account = { address: "wallet-address" } as never;

      render(
        <SelectedWalletAccountContext.Provider value={[account, vi.fn()]}>
          <App />
        </SelectedWalletAccountContext.Provider>
      );
      await waitFor(() =>
        expect(prefetchManageDataMock).toHaveBeenCalledWith(
          "jpool",
          "wallet-address",
          "mainnet",
          "vote-address"
        )
      );
      expect(prefetchManageDataMock).not.toHaveBeenCalledWith(
        "native",
        expect.anything(),
        expect.anything(),
        expect.anything()
      );
    });

    it("drops JPool on devnet with a warning and without an eligibility call", async () => {
      useNetworkMock.mockReturnValue({ network: "devnet" });
      useOptionsMock.mockReturnValue({ vote_account: "vote-address", tabs: ["native", "jpool"] });

      render(<App />);
      expect(screen.getAllByRole("tab")).toHaveLength(1);
      await waitFor(() =>
        expect(console.warn).toHaveBeenCalledWith(
          "[DeepStake widget] JPool is unavailable on devnet and was hidden"
        )
      );
      expect(fetchJpoolEligibilityMock).not.toHaveBeenCalled();
    });

    it("names every mainnet-only tab in the devnet configuration error", () => {
      useNetworkMock.mockReturnValue({ network: "devnet" });
      useOptionsMock.mockReturnValue({ vote_account: "vote-address", tabs: ["vault", "jpool"] });

      render(<App />);
      expect(screen.getByRole("alert")).toHaveTextContent(
        "DeepStake widget: Vault and JPool are unavailable on devnet; configure at least one supported tab"
      );
    });
  });
});
