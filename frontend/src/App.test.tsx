import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchEpochInfoMock, fetchPerfSamplesMock, fetchValidatorInfoMock, fetchValidatorLogoMock, useNetworkMock, useOptionsMock } = vi.hoisted(() => ({
  fetchEpochInfoMock: vi.fn(),
  fetchPerfSamplesMock: vi.fn(),
  fetchValidatorInfoMock: vi.fn(),
  fetchValidatorLogoMock: vi.fn(),
  useNetworkMock: vi.fn(),
  useOptionsMock: vi.fn(),
}));

vi.mock("@radix-ui/themes", () => ({ Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>, Flex: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("./components/RootLayout", () => ({ default: ({ children }: { children: React.ReactNode }) => <div data-testid="root-layout">{children}</div> }));
vi.mock("./components/TitleHeader", () => ({ TitleHeader: ({ progress, currentEpoch, secondsRemainToEpochEnd }: { progress: number; currentEpoch: number; secondsRemainToEpochEnd: number }) => <div data-testid="title-header">{String(progress) + ":" + String(currentEpoch) + ":" + String(secondsRemainToEpochEnd)}</div> }));
vi.mock("./components/stake/ValidatorInfo", () => ({ ValidatorInfo: ({ validatorInfo, logoUrl }: { validatorInfo: { name?: string } | null; logoUrl: string | null }) => <div data-testid="validator-info">{(validatorInfo?.name ?? "no-validator") + ":" + (logoUrl ?? "no-logo")}</div> }));
vi.mock("./components/stake/StakeForm", () => ({ StakeForm: () => <div>Native form</div> }));
vi.mock("./components/stake/StakeFormBlaze", () => ({ StakeFormBlaze: () => <div>Blaze form</div> }));
vi.mock("./components/stake/StakeFormVault2", () => ({ StakeFormVault2: () => <div>Vault form</div> }));
vi.mock("./context/NetworkContext", () => ({ useNetwork: useNetworkMock }));
vi.mock("./options", () => ({ useOptions: useOptionsMock }));
vi.mock("./utils/solana/validator", () => ({ fetchValidatorInfo: fetchValidatorInfoMock, fetchValidatorLogo: fetchValidatorLogoMock }));
vi.mock("./utils/api", () => ({ fetchEpochInfo: fetchEpochInfoMock, fetchPerfSamples: fetchPerfSamplesMock }));
vi.mock("./utils/imageUrl", () => ({ cssImageUrl: vi.fn((src: string) => 'url("' + src + '")') }));

import App from "./App";

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    useNetworkMock.mockReturnValue({ network: "devnet" });
    useOptionsMock.mockReturnValue({ vote_account: "vote-address" });
    fetchValidatorInfoMock.mockResolvedValue({ name: "Validator", vote_identity: "vote-address" });
    fetchValidatorLogoMock.mockResolvedValue("https://logo.example/logo.png");
    fetchEpochInfoMock.mockResolvedValue({ epochInfo: { epoch: 42, slotIndex: 25, slotsInEpoch: 100 } });
    fetchPerfSamplesMock.mockResolvedValue({ sample: { numSlots: 10, samplePeriodSecs: 5 } });
  });

  it("renders all staking tabs by default and fetches validator/epoch data", async () => {
    render(<App />);
    expect(screen.getByRole("tab", { name: /Native/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /BlazeStake/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Vault/ })).toBeInTheDocument();
    expect(screen.getByText("Native form")).toBeInTheDocument();
    await waitFor(() => expect(fetchValidatorInfoMock).toHaveBeenCalledWith("vote-address"));
    await waitFor(() => expect(screen.getByTestId("validator-info")).toHaveTextContent("Validator:https://logo.example/logo.png"));
    await waitFor(() => expect(screen.getByTestId("title-header")).toHaveTextContent("25:42:37.5"));
  });

  it("filters tabs from widget options and switches between enabled tabs", async () => {
    useOptionsMock.mockReturnValue({ vote_account: "vote-address", tabs: ["blaze", "vault"] });
    render(<App />);
    expect(screen.queryByRole("tab", { name: /Native/ })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /BlazeStake/ })).toBeInTheDocument();
    expect(screen.getByText("Blaze form")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: /Vault/ }));
    expect(screen.getByText("Vault form")).toBeInTheDocument();
  });

  it("does not fetch validator data without a vote account", () => {
    useOptionsMock.mockReturnValue(null);
    render(<App />);
    expect(fetchValidatorInfoMock).not.toHaveBeenCalled();
    expect(fetchValidatorLogoMock).not.toHaveBeenCalled();
    expect(fetchEpochInfoMock).not.toHaveBeenCalled();
  });

  it("keeps rendering when metadata and epoch requests fail", async () => {
    fetchValidatorInfoMock.mockRejectedValue(new Error("validator failed"));
    fetchValidatorLogoMock.mockRejectedValue(new Error("logo failed"));
    fetchEpochInfoMock.mockRejectedValue(new Error("epoch failed"));
    render(<App />);
    expect(screen.getByText("Native form")).toBeInTheDocument();
    await waitFor(() => expect(console.error).toHaveBeenCalled());
  });
});
