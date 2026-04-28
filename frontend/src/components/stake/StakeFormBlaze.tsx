"use client";

import { useState, useEffect, useCallback } from "react";
import { install } from "@solana/webcrypto-ed25519-polyfill";
import { StakeButtonBlaze } from "./StakeButtonBlaze";
import { WalletConnectButton } from "../WalletConnectButton";
import { StakeInputSection } from "./StakeInputSection";
import { StakeLayout } from "./StakeLayout";
import { NoWalletTable } from "./NoWalletTable";
import { BSOLBalanceTable2 } from "./BSOLBalanceTable2";
import { useStakeForm } from "../../hooks/useStakeForm";
import { ValidatorInfoResponse } from "../../utils/solana/validator";
import { fetchLSTBalance } from "../../utils/api";

install();

const BSOL_MINT = "bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1";

interface AppliedStake {
  voteAcc: string;
  amount: number;
}

interface Props {
  validatorInfo: ValidatorInfoResponse | null;
  secondsRemainToEpochEnd: number;
}

export function StakeFormBlaze({
  validatorInfo,
  secondsRemainToEpochEnd,
}: Props) {
  const {
    selectedWalletAccount,
    network,
    isConnected,
    balance,
    stakeAmount,
    formattedStakeAmount,
    setStakeAmount,
    setFormattedStakeAmount,
    handleInputChange,
    resetFormAndRefreshBalance,
    inSufficientBalance,
  } = useStakeForm();

  const [bSOLBalance, setbSOLBalance] = useState<number>(0);
  const [bSOLIsLoading, setBSOLIsLoading] = useState(false);
  const [appliedStakes, setAppliedStakes] = useState<AppliedStake[]>([]);
  const [appliedStakesIsLoading, setAppliedStakesIsLoading] = useState(false);

  const fetchAppliedStakes = async (walletAddress: string) => {
    setAppliedStakesIsLoading(true);
    try {
      const response = await fetch(
        `https://stake.solblaze.org/api/v1/cls_applied_user_stake?address=${walletAddress}`
      );
      const data = await response.json();
      if (data.success && data.applied_stakes) {
        const stakesArray: AppliedStake[] = Object.entries(data.applied_stakes).map(
          ([voteAcc, amount]) => ({
            voteAcc,
            amount: amount as number,
          })
        );
        setAppliedStakes(stakesArray);
      } else {
        setAppliedStakes([]);
      }
    } catch (err) {
      console.error("Failed to fetch applied stakes:", err);
      setAppliedStakes([]);
    }
    setAppliedStakesIsLoading(false);
  };

  const fetchBSOLBalance = async (walletAddress: string) => {
    setBSOLIsLoading(true);
    try {
      const balance = await fetchLSTBalance(walletAddress, network, BSOL_MINT);
      setbSOLBalance(balance);
    } catch (err) {
      console.error(err);
    }
    setBSOLIsLoading(false);
  };

  useEffect(() => {
    if (!isConnected) {
      setbSOLBalance(0);
      setAppliedStakes([]);
    }
  }, [isConnected]);

  useEffect(() => {
    if (!selectedWalletAccount) {
      setbSOLBalance(0);
      setAppliedStakes([]);
      return;
    }
    fetchBSOLBalance(selectedWalletAccount.address);
    fetchAppliedStakes(selectedWalletAccount.address);
  }, [selectedWalletAccount]);

  const handleSuccess = useCallback(() => {
    resetFormAndRefreshBalance();
    setbSOLBalance(0);
    setAppliedStakes([]);
  }, [resetFormAndRefreshBalance]);

  return (
    <StakeLayout
      stakeChildren={
        <>
          <StakeInputSection
            isConnected={isConnected}
            selectedWalletAddress={selectedWalletAccount?.address}
            balance={balance}
            formattedStakeAmount={formattedStakeAmount}
            onInputChange={handleInputChange}
            onSetStakeAmount={setStakeAmount}
            onSetFormattedStakeAmount={setFormattedStakeAmount}
            validatorInfo={validatorInfo}
            secondsRemainToEpochEnd={secondsRemainToEpochEnd}
            stakeMode="blaze"
          />
          {isConnected && selectedWalletAccount ? (
            <StakeButtonBlaze
              network={network}
              account={selectedWalletAccount}
              stakeAmount={stakeAmount}
              onSuccess={handleSuccess}
              inSufficientBalance={inSufficientBalance}
              onDataLoaded={setbSOLBalance}
              onBSOLIsLoading={setBSOLIsLoading}
              voteIdentity={validatorInfo?.vote_identity}
            />
          ) : (
            <WalletConnectButton />
          )}
        </>
      }
      manageChildren={
        isConnected && selectedWalletAccount ? (
          <BSOLBalanceTable2
            bSOLBalance={bSOLBalance}
            isLoading={bSOLIsLoading}
            validatorName={validatorInfo?.name}
            appliedStakes={appliedStakes}
            isAppliedStakesLoading={appliedStakesIsLoading}
          />
        ) : (
          <>
            <NoWalletTable />
            <WalletConnectButton />
          </>
        )
      }
    />
  );
}
