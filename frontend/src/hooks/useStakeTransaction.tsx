"use client";

import { useCallback, useState } from "react";
import { UiWalletAccount } from "@wallet-standard/react";
import { useWalletAccountTransactionSendingSigner } from "@solana/react";
import {
  generateKeyPairSigner,
  getBase58Decoder,
  getBase64Encoder,
  getTransactionDecoder,
  partiallySignTransaction,
} from "@solana/kit";
import { getCurrentChain, getValidatorAddress } from "../utils/config";
import { LAMPORTS_PER_SOL } from "../utils/constants";
import { GetStakeAccountResponse } from "../utils/solana/stake/get-stake-accounts";
import {
  generateStakeTransaction,
  fetchStakeAccounts,
  confirmTransaction,
} from "../utils/api";
import { invalidateStakeAccountsCache } from "../utils/stakeAccountsCache";

export interface UseStakeTransactionOptions {
  network: string;
  account: UiWalletAccount;
  stakeAmount: string;
  inSufficientBalance: boolean;
  onSuccess: () => void;
  onDataLoaded: (stakeAccounts: GetStakeAccountResponse[]) => void;
}

export interface UseStakeTransactionResult {
  isSendingTransaction: boolean;
  lastSignature?: string;
  lastStakeAccount?: string;
  error?: unknown;
  disableStakeButton: boolean;
  buttonLabel: string;
  handleSubmit: (event: React.MouseEvent<HTMLButtonElement>) => Promise<void>;
  handleCloseModal: () => void;
}

export function useStakeTransaction({
  network,
  account,
  stakeAmount,
  inSufficientBalance,
  onSuccess,
  onDataLoaded,
}: UseStakeTransactionOptions) {
  const currentChain = getCurrentChain();
  const transactionSendingSigner = useWalletAccountTransactionSendingSigner(
    account,
    currentChain
  );

  const [isSendingTransaction, setIsSendingTransaction] = useState(false);
  const [lastSignature, setLastSignature] = useState<string | undefined>();
  const [lastStakeAccount, setLastStakeAccount] = useState<string | undefined>();

  const [error, setError] = useState<unknown | undefined>(undefined);

  const handleSubmit = useCallback(
    async (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      if (!stakeAmount || !transactionSendingSigner) return;

      setError(undefined);
      setIsSendingTransaction(true);
      setLastSignature(undefined);
      setLastStakeAccount(undefined);
      try {
        const newAccount = await generateKeyPairSigner();
        setLastStakeAccount(newAccount.address);

        // Convert SOL to lamports
        const stakeLamportsAmount = Math.floor(
          parseFloat(stakeAmount) * LAMPORTS_PER_SOL
        );

        // Step 1: Generate the transaction message
        const wireTransaction = await generateStakeTransaction(network, {
          newAccountAddress: newAccount.address,
          stakeLamports: stakeLamportsAmount,
          stakerAddress: account.address,
          voteAccount: getValidatorAddress(),
        });

        const base64Encoder = getBase64Encoder();
        const transactionBytes = base64Encoder.encode(wireTransaction);
        const transactionDecoder = getTransactionDecoder();
        const decodedTransaction = transactionDecoder.decode(transactionBytes);
        const partialSignedTransaction = await partiallySignTransaction(
          [newAccount.keyPair],
          decodedTransaction
        );
        // leverages the wallet's transaction sending signer and rpc
        const rawSignature =
          await transactionSendingSigner.signAndSendTransactions([
            partialSignedTransaction,
          ]);
        const signature = getBase58Decoder().decode(rawSignature[0]);

        // Call the new confirmation API endpoint
        await confirmTransaction(network, {
          txid: signature,
          targetCommitment: "processed",
          timeout: 30000,
          interval: 1000,
        });

        setLastSignature(signature);
      } catch (err) {
        console.error("Staking error:", err);
        setError(err);
        setLastStakeAccount(undefined);
      } finally {
        setIsSendingTransaction(false);

        // Invalidate cache so the next fetch gets fresh data
        invalidateStakeAccountsCache(account.address, network);

        // Fetch stake accounts
        fetchStakeAccounts(account.address, network)
          .then((accounts) => {
            onDataLoaded(accounts);
          })
          .catch((error) =>
            console.error("Failed to fetch stake accounts:", error)
          );
      }
    },
    [account, stakeAmount, transactionSendingSigner, network, onDataLoaded]
  );

  const handleCloseModal = useCallback(() => {
    setLastSignature(undefined);
    setLastStakeAccount(undefined);
    onSuccess();
  }, [onSuccess]);

  const stakeAmountNumber = parseFloat(stakeAmount) || 0;
  const isZeroStake = stakeAmountNumber <= 0;
  const disableStakeButton =
    isSendingTransaction || inSufficientBalance || isZeroStake;
  const buttonLabel = isSendingTransaction
    ? "Confirming Transaction"
    : inSufficientBalance
    ? "Insufficient Balance"
    : isZeroStake
    ? "Enter stake amount"
    : "Stake";

  return {
    isSendingTransaction,
    lastSignature,
    lastStakeAccount,
    error,
    disableStakeButton,
    buttonLabel,
    handleSubmit,
    handleCloseModal,
  } as UseStakeTransactionResult;
}
