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
import { getImageUrl } from "../../utils/imageUrl";

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
  const isDevnet = network === "devnet";
  const manageValidatorName = isDevnet ? undefined : validatorInfo?.name;
  const blazeManageIsLoading = bSOLIsLoading || appliedStakesIsLoading;

  const fetchAppliedStakes = async (walletAddress: string) => {
    if (isDevnet) {
      setAppliedStakes([]);
      setAppliedStakesIsLoading(false);
      return;
    }

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
  }, [isDevnet, selectedWalletAccount]);

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
          <div className="manage-wrap">
            {blazeManageIsLoading && (
              <div className="manage-overlay">
                <img className="manage-loader-light" src={getImageUrl("/images/mid_loader.png")} alt="" />
                <img className="manage-loader-dark" src={getImageUrl("/images/big_loader.png")} alt="" />
              </div>
            )}
            <BSOLBalanceTable2
              bSOLBalance={bSOLBalance}
              isLoading={false}
              validatorName={manageValidatorName}
              appliedStakes={appliedStakes}
              isAppliedStakesLoading={false}
              showValidatorPlaceholder={isDevnet}
            />
            <style>{`
              [data-widget="deepstake"] .manage-wrap {
                position: relative;
                min-height: 200px;
              }

              [data-widget="deepstake"] .manage-overlay {
                position: absolute;
                inset: 0;
                background: rgba(255, 255, 255, 0.92);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10;
                border-radius: 4px;
              }

              [data-widget="deepstake"][data-theme="dark"] .manage-overlay {
                background: rgba(18, 18, 24, 0.92);
              }

              [data-widget="deepstake"] .manage-loader-light,
              [data-widget="deepstake"] .manage-loader-dark {
                width: 48px;
                height: 48px;
                object-fit: contain;
                animation: overlay-spin 1s linear infinite;
              }

              [data-widget="deepstake"] .manage-loader-dark {
                display: none;
              }

              [data-widget="deepstake"][data-theme="dark"] .manage-loader-light {
                display: none;
              }

              [data-widget="deepstake"][data-theme="dark"] .manage-loader-dark {
                display: block;
              }

              @keyframes overlay-spin {
                to { transform: rotate(360deg); }
              }
            `}</style>
          </div>
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
