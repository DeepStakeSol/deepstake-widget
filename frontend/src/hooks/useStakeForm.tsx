"use client";

import { useState, useEffect, useContext, useCallback } from "react";
import { SelectedWalletAccountContext } from "../context/SelectedWalletAccountContext";
import { PRIORITY_FEE_BUFFER, STAKE_PROGRAM } from "../utils/constants";
import { useIsWalletConnected } from "./useIsWalletConnected";
import { GetStakeAccountResponse } from "../utils/solana/stake/get-stake-accounts";
import { useNetwork } from "../context/NetworkContext";
import { fetchStakeAccounts, fetchSolBalance } from "../utils/api";

export function useStakeForm() {
  const [selectedWalletAccount] = useContext(SelectedWalletAccountContext);
  const { network } = useNetwork();
  const isConnected = useIsWalletConnected();

  const [balance, setBalance] = useState<number>(0);
  const [stakeAmount, setStakeAmount] = useState<string>("");
  const [formattedStakeAmount, setFormattedStakeAmount] = useState<string>("");
  const [stakeAccounts, setStakeAccounts] =
    useState<GetStakeAccountResponse[]>([]);
  const [selectedRow, setSelectedRow] =
    useState<GetStakeAccountResponse | null>(null);

  // fetch balance (via RPC) and stake accounts (via backend) whenever
  // wallet or network changes.
  useEffect(() => {
    if (!selectedWalletAccount) {
      setBalance(0);
      setStakeAccounts([]);
      return;
    }

    // rpc-based balance lookup
    updBalance();

    // grab stake accounts from backend
    fetchStakeAccounts(selectedWalletAccount.address, network)
      .then((accounts) => {
        setStakeAccounts(accounts);
      })
      .catch((error) =>
        console.error("Failed to fetch stake accounts:", error)
      );
  }, [selectedWalletAccount, network]);

  const handleInputChange = useCallback((value: string) => {
    let cleanValue = value.replace(/,/g, ".").replace(/[^\d.]/g, "");

    // Keep only the first dot, ignore all subsequent ones
    const firstDotIndex = cleanValue.indexOf(".");
    if (firstDotIndex !== -1) {
      cleanValue =
        cleanValue.slice(0, firstDotIndex + 1) +
        cleanValue.slice(firstDotIndex + 1).replace(/\./g, "");
    }

    if (cleanValue.startsWith(".")) {
      cleanValue = "0" + cleanValue;
    }

    const parts = cleanValue.split(".");

    let integerPart = parts[0] || "";
    integerPart = integerPart === "0" ? "0" : integerPart.replace(/^0+/, "");
    //integerPart = integerPart.slice(0, 7);

    let decimalPart = "";
    if (parts.length > 1) {
      decimalPart = parts[1].slice(0, 6);
    }

    cleanValue =
      parts.length > 1 ? `${integerPart}.${decimalPart}` : integerPart;

    setStakeAmount(cleanValue);
    setFormattedStakeAmount(cleanValue || "");
  }, []);

  async function updBalance() {
    if (!selectedWalletAccount) return;
    const solBalance = await fetchSolBalance(selectedWalletAccount.address, network);
    setBalance(solBalance);
  }

  const resetFormAndRefreshBalance = useCallback(() => {
    setStakeAmount("");
    setFormattedStakeAmount("");

    // Refresh balance if wallet is connected
    if (selectedWalletAccount) {
      updBalance();

      fetchStakeAccounts(selectedWalletAccount.address, network)
      .then((accounts) => {
        setStakeAccounts(accounts);
      });
    }
  }, [selectedWalletAccount, network]);

  const stakeSol = parseFloat(stakeAmount);
  const inSufficientBalance =
    stakeSol > balance - STAKE_PROGRAM.STAKE_ACCOUNT_RENT -
    PRIORITY_FEE_BUFFER;

  return {
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
    updBalance,
    resetFormAndRefreshBalance,
    stakeSol,
    inSufficientBalance,
  };
}
