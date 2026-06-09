import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../utils/imageUrl", () => ({
  cssImageUrl: vi.fn((src: string) => 'url("' + src + '")'),
}));

import { WalletBalance } from "./WalletBalance";

const validatorInfoFixture = {
  total_apy: 7.25,
  commission: 8,
  is_jito: true,
  jito_commission_bps: 250,
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
        validatorInfo={{ ...validatorInfoFixture, is_jito: false } as never}
        secondsRemainToEpochEnd={86400}
      />
    );

    expect(screen.queryByText("MEV Commission :")).not.toBeInTheDocument();
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
