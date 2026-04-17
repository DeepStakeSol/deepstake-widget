"use client";

import { install } from "@solana/webcrypto-ed25519-polyfill";
import { WalletConnectButton } from "../WalletConnectButton";
import { StakeAccountsTable } from "./StakeAccountsTable";
import { StakeButton } from "./StakeButton";
import { StakeInputSection } from "./StakeInputSection";
import { StakeLayout } from "./StakeLayout";
import { NoWalletTable } from "./NoWalletTable";
import { NoAccountsTable } from "./NoAccountsTable";
import { ValidatorInfoResponse } from "../../utils/solana/validator";
import { useStakeForm } from "../../hooks/useStakeForm";

install();

interface Props {
  currentEpoch: number;
  validatorInfo: ValidatorInfoResponse | null;
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
