"use client";

import { useState, useEffect, useCallback } from "react";
import { install } from "@solana/webcrypto-ed25519-polyfill";
import { StakeButtonVault2 } from "./StakeButtonVault2";
import { WalletConnectButton } from "../WalletConnectButton";
import { StakeInputSection } from "./StakeInputSection";
import { StakeLayout } from "./StakeLayout";
import { NoWalletTable } from "./NoWalletTable";
import { VSOLBalanceTable } from "./VSOLBalanceTable";
import { VaultBindingBlock } from "./VaultBindingBlock";
import { useStakeForm } from "../../hooks/useStakeForm";
import { ValidatorInfoResponse } from "../../utils/solana/validator";
import { fetchVaultManage, fetchLSTBalance, VaultManageResponse } from "../../utils/api";

install();

const VSOL_MINT = "vSoLxydx6akxyMD9XEcPvGYNGq6Nn66oqVb3UkGkei7";

interface Props {
  validatorInfo: ValidatorInfoResponse | null;
  secondsRemainToEpochEnd: number;
}

export function StakeFormVault2({
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

  const [vSOLBalance, setvSOLBalance] = useState<number>(0);
  const [vSOLIsLoading, setVSOLIsLoading] = useState(false);
  const [vaultManage, setVaultManage] = useState<VaultManageResponse | null>(null);
  const [vaultManageIsLoading, setVaultManageIsLoading] = useState(false);

  const fetchVaultManageData = async (walletAddress: string) => {
    setVaultManageIsLoading(true);
    try {
      const data = await fetchVaultManage(walletAddress, network);
      setVaultManage(data);
    } catch {
      setVaultManage(null);
    }
    setVaultManageIsLoading(false);
  };

  const fetchVSOLBalance = async (walletAddress: string) => {
    setVSOLIsLoading(true);
    try {
      const balance = await fetchLSTBalance(walletAddress, network, VSOL_MINT);
      setvSOLBalance(balance);
    } catch (err) {
      console.error(err);
    }
    setVSOLIsLoading(false);
  };

  useEffect(() => {
    if (!isConnected) {
      setvSOLBalance(0);
      setVaultManage(null);
    }
  }, [isConnected]);

  useEffect(() => {
    if (!selectedWalletAccount) {
      setvSOLBalance(0);
      setVaultManage(null);
      return;
    }
    fetchVSOLBalance(selectedWalletAccount.address);
    fetchVaultManageData(selectedWalletAccount.address);
  }, [selectedWalletAccount]);

  const handleSuccess = useCallback(() => {
    resetFormAndRefreshBalance();
    setvSOLBalance(0);
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
            stakeMode="vault"
          />
          {isConnected && selectedWalletAccount ? (
            <StakeButtonVault2
              network={network}
              account={selectedWalletAccount}
              stakeAmount={stakeAmount}
              onSuccess={handleSuccess}
              inSufficientBalance={inSufficientBalance}
              onDataLoaded={setvSOLBalance}
              onVSOLIsLoading={setVSOLIsLoading}
              balance={balance}
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
            {vaultManageIsLoading && (
              <div className="manage-overlay">
                <img className="manage-loader-light" src="/images/mid_loader.png" alt="" />
                <img className="manage-loader-dark" src="/images/big_loader.png" alt="" />
              </div>
            )}
            <VaultBindingBlock data={vaultManage} isLoading={false} validatorInfo={validatorInfo} />
            <div className="unstake-info">
              <p>To unstake it, sell them through your wallet or DEX.</p>
              <p>When selling, the distribution of direct stake will change proportionally.</p>
              <a href="https://jup.ag" target="_blank" rel="noopener noreferrer" className="jupiter-btn">Jupiter</a>
            </div>
            <style jsx>{`
              .manage-wrap {
                position: relative;
                min-height: 200px;
              }

              .manage-overlay {
                position: absolute;
                inset: 0;
                background: rgba(255, 255, 255, 0.92);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10;
                border-radius: 4px;
              }

              #root[data-theme="dark"] .manage-overlay {
                background: rgba(18, 18, 24, 0.92);
              }

              .manage-loader-light,
              .manage-loader-dark {
                width: 48px;
                height: 48px;
                object-fit: contain;
                animation: overlay-spin 1s linear infinite;
              }

              .manage-loader-dark {
                display: none;
              }

              #root[data-theme="dark"] .manage-loader-light {
                display: none;
              }

              #root[data-theme="dark"] .manage-loader-dark {
                display: block;
              }

              @keyframes overlay-spin {
                to { transform: rotate(360deg); }
              }

              .unstake-info {
                background: #fff;
                border-radius: 10px;
                padding: 20px 30px 40px 30px;
              }

              .unstake-info p {
                margin: 0 0 10px 0;
                color: #555;
              }

              .jupiter-btn {
                display: inline-block;
                background: #E5E4E4;
                color: #000;
                text-decoration: none;
                padding: 0 16px;
                border-radius: 10px;
                font-weight: 500;
                transition: opacity 0.2s ease;
                height: 24px;
                width: 100px;
                text-align: center;
                font-size: 16px;
              }

              .jupiter-btn:hover {
                opacity: 0.8;
              }

              #root[data-theme="dark"] .unstake-info {
                background: #9F9FAC1A;
              }

              #root[data-theme="dark"] .unstake-info p {
                color: #9F9FAC;
              }

              #root[data-theme="dark"] .jupiter-btn {
                background: #5A5A62;
                color: #9F9FAC;
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
