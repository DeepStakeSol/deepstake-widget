"use client";

import { useState, useEffect, useCallback } from "react";
import { install } from "@solana/webcrypto-ed25519-polyfill";
import * as solanaWeb3 from '@solana/web3.js';
import { StakeButtonVault2 } from "./StakeButtonVault2";
import { WalletConnectButton } from "../WalletConnectButton";
import { StakeInputSection } from "./StakeInputSection";
import { StakeLayout } from "./StakeLayout";
import { NoWalletTable } from "./NoWalletTable";
import { VSOLBalanceTable } from "./VSOLBalanceTable";
import { useStakeForm } from "../../hooks/useStakeForm";
import { ValidatorInfoResponse } from "../../utils/solana/validator";

import type {
  Connection as ConnectionType,
  PublicKey as PublicKeyType,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  getAccount,
} from "@solana/spl-token";

install();

const { Connection, PublicKey } = solanaWeb3;

async function getVsolBalance(
  connection: ConnectionType,
  walletPubkey: PublicKeyType,
  vsolMint: PublicKeyType
): Promise<number> {
  const ata = await getAssociatedTokenAddress(
    vsolMint,
    walletPubkey
  );

  try {
    const account = await getAccount(connection, ata);
    return Number(account.amount) / 1e9;
  } catch (_e) {
    return 0;
  }
}

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

  const fetchVSOLBalance = async (wPubkey: PublicKeyType) => {
    const VSOL_MINT = new PublicKey("vSoLxydx6akxyMD9XEcPvGYNGq6Nn66oqVb3UkGkei7");
    const heliusApi = import.meta.env.VITE_MAINNET_HELIUS_API_KEY;
    const vaultEndpoint = `https://mainnet.helius-rpc.com/?api-key=${heliusApi}`;
    const connection = new Connection(vaultEndpoint);

    setVSOLIsLoading(true);
    try {
      const vSOLBal = await getVsolBalance(
        connection,
        wPubkey,
        VSOL_MINT
      );
      setvSOLBalance(vSOLBal);
    } catch (err) {
      console.error(err);
    }
    setVSOLIsLoading(false);
  };

  useEffect(() => {
    if (!isConnected) {
      setvSOLBalance(0);
    }
  }, [isConnected]);

  useEffect(() => {
    if (!selectedWalletAccount) {
      setvSOLBalance(0);
      return;
    }
    const wPubkey = new PublicKey(selectedWalletAccount.address);
    fetchVSOLBalance(wPubkey);
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
          <VSOLBalanceTable
            vSOLBalance={vSOLBalance}
            isLoading={vSOLIsLoading}
            validatorName={validatorInfo?.name}
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
