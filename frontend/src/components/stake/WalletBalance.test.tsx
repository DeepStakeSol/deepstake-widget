import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../utils/imageUrl", () => ({
  cssImageUrl: vi.fn((src: string) => 'url("' + src + '")'),
}));

import { WalletBalance } from "./WalletBalance";

const validatorInfoFixture = {
  voteAccount: "vote-account",
  name: "Validator",
  description: null,
  estimatedApyPercent: 7.25,
  commissionPercent: 8,
  mevEnabled: true,
  mevCommissionPercent: 2.5,
};

const validatorInfo = validatorInfoFixture as never;

describe("WalletBalance", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders balance and validator economics", () => {
    render(
      <WalletBalance
        balance={12.345}
        validatorInfo={validatorInfo}
        secondsRemainToEpochEnd={172800}
        stakeMode="default"
      />
    );

    expect(screen.getByText("12.35 SOL")).toBeInTheDocument();
    expect(screen.getByText("7.25%")).toBeInTheDocument();
    expect(screen.getByText("8%")).toBeInTheDocument();
    expect(screen.getByText("MEV Commission :")).toBeInTheDocument();
    expect(screen.getByText("2.5%")).toBeInTheDocument();
    expect(screen.getByText(/2 days/)).toBeInTheDocument();
  });

  it("does not render MEV commission for non-Jito validators", () => {
    render(
      <WalletBalance
        balance={1}
        validatorInfo={{ ...validatorInfoFixture, mevEnabled: false } as never}
        secondsRemainToEpochEnd={86400}
      />
    );

    expect(screen.queryByText("MEV Commission :")).not.toBeInTheDocument();
  });

  it("renders unavailable economics without implying zero", () => {
    render(
      <WalletBalance balance={1} validatorInfo={null} secondsRemainToEpochEnd={86400} />
    );

    expect(screen.getByText("Estimated APY :")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(2);
    expect(screen.queryByText("MEV Commission :")).not.toBeInTheDocument();
  });

  it("preserves zero-valued economics", () => {
    render(
      <WalletBalance
        balance={1}
        validatorInfo={{
          ...validatorInfoFixture,
          estimatedApyPercent: 0,
          commissionPercent: 0,
          mevCommissionPercent: 0,
        } as never}
        secondsRemainToEpochEnd={86400}
      />
    );

    expect(screen.getAllByText("0%")).toHaveLength(3);
  });

  it("uses instant unlock text for liquid staking modes", () => {
    render(
      <WalletBalance
        balance={1}
        validatorInfo={validatorInfo}
        secondsRemainToEpochEnd={86400}
        stakeMode="vault"
      />
    );

    expect(screen.getByText("instantly")).toBeInTheDocument();
  });
});
