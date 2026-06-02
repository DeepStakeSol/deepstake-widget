"use client";

import { useState, useEffect, useCallback } from "react";
import { Card } from "@radix-ui/themes";
import { install } from "@solana/webcrypto-ed25519-polyfill";
import { StakeButtonVault2 } from "./StakeButtonVault2";
import { WalletConnectButton } from "../WalletConnectButton";
import { StakeInputSection } from "./StakeInputSection";
import { StakeLayout } from "./StakeLayout";
import { NoWalletTable } from "./NoWalletTable";
import { VaultBindingBlock } from "./VaultBindingBlock";
import { useStakeForm } from "../../hooks/useStakeForm";
import { getImageUrl } from "../../utils/imageUrl";
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

  const isDevnet = network === "devnet";
  const [, setvSOLBalance] = useState<number>(0);
  const [, setVSOLIsLoading] = useState(false);
  const [vaultManage, setVaultManage] = useState<VaultManageResponse | null>(null);
  const [vaultManageIsLoading, setVaultManageIsLoading] = useState(false);

  const fetchVaultManageData = useCallback(async (walletAddress: string) => {
    setVaultManageIsLoading(true);
    try {
      const data = await fetchVaultManage(walletAddress, network);
      setVaultManage(data);
      return data;
    } catch {
      setVaultManage(null);
      return null;
    } finally {
      setVaultManageIsLoading(false);
    }
  }, [network]);

  const logVaultManageData = useCallback((data: VaultManageResponse | null) => {
    if (!data) {
      // eslint-disable-next-line no-console
      console.info("[Vault Manage]", {
        hasVaultDirectedStakeBinding: false,
        latestStakebotDataContainsGeneratedStake: false,
        latestStakebotDataUrl: null,
      });
      return;
    }

    // eslint-disable-next-line no-console
    console.info("[Vault Manage]", {
      hasVaultDirectedStakeBinding: data.binding.hasBinding,
      latestStakebotDataContainsGeneratedStake: data.stakebot.found,
      latestStakebotDataUrl: data.stakebot.sourceUrl ?? null,
    });
  }, []);

  const handleManageOpen = useCallback(async () => {
    if (isDevnet || !isConnected || !selectedWalletAccount) {
      return;
    }

    const data = await fetchVaultManageData(selectedWalletAccount.address);
    logVaultManageData(data);
  }, [
    fetchVaultManageData,
    isConnected,
    isDevnet,
    logVaultManageData,
    selectedWalletAccount,
  ]);

  const fetchVSOLBalance = useCallback(async (walletAddress: string) => {
    setVSOLIsLoading(true);
    try {
      const balance = await fetchLSTBalance(walletAddress, network, VSOL_MINT);
      setvSOLBalance(balance);
    } catch (err) {
      console.error(err);
    }
    setVSOLIsLoading(false);
  }, [network]);

  useEffect(() => {
    if (isDevnet || !isConnected) {
      setvSOLBalance(0);
      setVaultManage(null);
    }
  }, [isDevnet, isConnected]);

  useEffect(() => {
    if (isDevnet) {
      setvSOLBalance(0);
      setVaultManage(null);
      setVSOLIsLoading(false);
      setVaultManageIsLoading(false);
      return;
    }

    if (!selectedWalletAccount) {
      setvSOLBalance(0);
      setVaultManage(null);
      return;
    }
    fetchVSOLBalance(selectedWalletAccount.address);
    fetchVaultManageData(selectedWalletAccount.address);
  }, [fetchVSOLBalance, fetchVaultManageData, isDevnet, selectedWalletAccount]);

  const handleSuccess = useCallback(() => {
    resetFormAndRefreshBalance();
    setvSOLBalance(0);
  }, [resetFormAndRefreshBalance]);

  if (isDevnet) {
    return (
      <Card
        size="3"
        className="stake-form vault-devnet-card"
        style={{ padding: "25px 50px" }}
      >
        <div className="vault-devnet-empty">
          The Vault only works in the mainnet cluster
        </div>
        <style jsx>{`
          [data-widget="deepstake"] .vault-devnet-card {
            background-color: #fff;
          }

          [data-widget="deepstake"] .vault-devnet-empty {
            min-height: 376px;
            display: flex;
            align-items: center;
            justify-content: center;
            text-align: center;
            color: #000;
            font-size: 16px;
            font-weight: 500;
            line-height: 1.4;
          }

          [data-widget="deepstake"][data-theme="dark"] .vault-devnet-card {
            background-color: #9f9fac29;
            color: #9F9FAC;
            border: 0;
          }

          [data-widget="deepstake"][data-theme="dark"] .vault-devnet-empty {
            color: #9F9FAC;
          }
        `}</style>
      </Card>
    );
  }

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
                <img className="manage-loader-light" src={getImageUrl("/images/mid_loader.png")} alt="" />
                <img className="manage-loader-dark" src={getImageUrl("/images/big_loader.png")} alt="" />
              </div>
            )}
            <VaultBindingBlock data={vaultManage} isLoading={false} validatorInfo={validatorInfo} />
            <div className="unstake-info">
              <p>To unstake it, sell them through your wallet or DEX.</p>
              <a href="https://jup.ag" target="_blank" rel="noopener noreferrer" className="jupiter-btn">Jupiter</a>
            </div>
            <style jsx>{`
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

              [data-widget="deepstake"] .unstake-info {
                background: #fff;
                border-radius: 10px;
                padding: 20px 30px 40px 30px;
              }

              [data-widget="deepstake"] .unstake-info p {
                margin: 0 0 10px 0;
                color: #555;
              }

              [data-widget="deepstake"] .jupiter-btn {
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

              [data-widget="deepstake"] .jupiter-btn:hover {
                opacity: 0.8;
              }

              [data-widget="deepstake"][data-theme="dark"] .unstake-info {
                background: #9F9FAC1A;
              }

              [data-widget="deepstake"][data-theme="dark"] .unstake-info p {
                color: #9F9FAC;
              }

              [data-widget="deepstake"][data-theme="dark"] .jupiter-btn {
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
      onManageOpen={handleManageOpen}
    />
  );
}
