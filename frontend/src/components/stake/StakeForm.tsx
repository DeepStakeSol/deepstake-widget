"use client";

import { useCallback } from "react";
import { install } from "@solana/webcrypto-ed25519-polyfill";
import { WalletConnectButton } from "../WalletConnectButton";
import { StakeAccountsTable } from "./StakeAccountsTable";
import { StakeButton } from "./StakeButton";
import { StakeInputSection } from "./StakeInputSection";
import { StakeLayout } from "./StakeLayout";
import { NoWalletTable } from "./NoWalletTable";
import { NoAccountsTable } from "./NoAccountsTable";
import { ValidatorProfile } from "../../utils/solana/validator";
import { useStakeForm } from "../../hooks/useStakeForm";
import { fetchStakeAccounts } from "../../utils/api";

install();

interface Props {
  currentEpoch: number;
  validatorInfo: ValidatorProfile | null;
  secondsRemainToEpochEnd: number;
}

export function StakeForm({ 
  currentEpoch, 
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
    stakeAccounts,
    setStakeAccounts,
    selectedRow,
    setSelectedRow,
    handleInputChange,
    resetFormAndRefreshBalance,
    inSufficientBalance,
  } = useStakeForm();

  const handleManageOpen = useCallback(() => {
    if (!selectedWalletAccount) return;

    void fetchStakeAccounts(selectedWalletAccount.address, network)
      .then(setStakeAccounts)
      .catch((error) => {
        console.error("Failed to refresh stake accounts:", error);
      });
  }, [network, selectedWalletAccount, setStakeAccounts]);

  return (
    <StakeLayout
      onManageOpen={handleManageOpen}
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
            stakeMode="default"
          />
          {isConnected && selectedWalletAccount ? (
            <StakeButton
              network={network}
              account={selectedWalletAccount}
              stakeAmount={stakeAmount}
              onSuccess={resetFormAndRefreshBalance}
              inSufficientBalance={inSufficientBalance}
              onDataLoaded={setStakeAccounts}
            />
          ) : (
            <WalletConnectButton />
          )}
        </>
      }
      manageChildren={
        isConnected && selectedWalletAccount && stakeAccounts.length > 0 ? (
          <StakeAccountsTable
            network={network}
            stakeAccounts={stakeAccounts}
            currentEpoch={currentEpoch}
            key={stakeAccounts.length}
            selectedRow={selectedRow}
            onSelectRow={setSelectedRow}
            account={selectedWalletAccount}
            onSuccess={resetFormAndRefreshBalance}
          />
        ) : isConnected && selectedWalletAccount ? (
          <NoAccountsTable />
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
