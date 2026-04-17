"use client";

import { useState, useEffect, useCallback } from "react";
import { install } from "@solana/webcrypto-ed25519-polyfill";
import * as solanaWeb3 from '@solana/web3.js';
import { StakeButtonBlaze } from "./StakeButtonBlaze";
import { WalletConnectButton } from "../WalletConnectButton";
import { StakeInputSection } from "./StakeInputSection";
import { StakeLayout } from "./StakeLayout";
import { NoWalletTable } from "./NoWalletTable";
import { BSOLBalanceTable2 } from "./BSOLBalanceTable2";
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

interface AppliedStake {
  voteAcc: string;
  amount: number;
}

async function getBsolBalance(
  connection: ConnectionType,
  walletPubkey: PublicKeyType,
  bsolMint: PublicKeyType
): Promise<number> {
  const ata = await getAssociatedTokenAddress(
    bsolMint,
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

  const fetchBSOLBalance = async (wPubkey: PublicKeyType) => {
    const BSOL_MINT = new PublicKey("bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1");
    const heliusApi = import.meta.env.VITE_MAINNET_HELIUS_API_KEY;
    const vaultEndpoint = `https://mainnet.helius-rpc.com/?api-key=${heliusApi}`;
    const connection = new Connection(vaultEndpoint);

    setBSOLIsLoading(true);
    try {
      const bSOLBal = await getBsolBalance(
        connection,
        wPubkey,
        BSOL_MINT
      );
      setbSOLBalance(bSOLBal);
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
    const wPubkey = new PublicKey(selectedWalletAccount.address);
    fetchBSOLBalance(wPubkey);
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
