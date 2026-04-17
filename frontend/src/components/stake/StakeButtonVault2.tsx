import { useCallback, useEffect, useRef, useState } from "react";
import { UiWalletAccount } from "@wallet-standard/react";
import { useWalletAccountTransactionSendingSigner } from "@solana/react";
import {
  getBase58Decoder,
  getTransactionDecoder,
} from "@solana/kit";
import { getCurrentChain } from "../../utils/config";
import { StakeButtonBase } from "./StakeButtonBase";
import { useStakingModal } from "../../context/StakingModalContext";

import * as solanaWeb3 from '@solana/web3.js';

import { VersionedTransaction } from "@solana/web3.js";

interface StakeButtonProps {
  network: string;
  account: UiWalletAccount;
  stakeAmount: string;
  inSufficientBalance: boolean;
  onSuccess: () => void;
  onDataLoaded: (vSOLBalance: number) => void;
  onVSOLIsLoading: (isLoading: boolean) => void;
  balance: number;
  voteIdentity?: string;
}

import { confirmTransaction } from "../../utils/api";


// ===================
//  web3.js related
// ===================
const { LAMPORTS_PER_SOL } = solanaWeb3;

export function StakeButtonVault2({
  network,
  account,
  stakeAmount,
  inSufficientBalance,
  onSuccess,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onDataLoaded,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onVSOLIsLoading,
  balance,
  voteIdentity,
}: StakeButtonProps) {
  const { showSuccessModal, hideSuccessModal } = useStakingModal();
  const currentChain = getCurrentChain();
  const transactionSendingSigner = useWalletAccountTransactionSendingSigner(
    account,
    currentChain
  );

  const [isSubmittingTransaction, setIsSubmittingTransaction] = useState(false);
  const [vaultSignature, setVaultSignature] = useState<string | undefined>();
  const { current: NO_ERROR } = useRef(Symbol());
  const [currentError, setCurrentError] = useState(NO_ERROR);

    const handleVaultSubmit = useCallback(
    async (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
                  
      if (!stakeAmount || !transactionSendingSigner) return;

      setCurrentError(NO_ERROR);
      setIsSubmittingTransaction(true);
      setVaultSignature(undefined);

      try {
          // Convert SOL to lamports
          const stakeLamportsAmount = Math.floor(
            parseFloat(stakeAmount) * LAMPORTS_PER_SOL
          );

          // Convert Balance to lamports
          const balanceLamports = Math.floor(
            parseFloat(balance.toString()) * LAMPORTS_PER_SOL
          );

          const fetchVaultTransaction = async () => {
              const mint = import.meta.env.VITE_VAULT_MINT;
              const target = voteIdentity;

              const url = import.meta.env.VITE_VAULT_TX_URL +
                  `?address=${account?.address}&mint=${mint}&amount=${stakeLamportsAmount}&balance=${balanceLamports}${target ? `&target=${target}` : ""}`;

              // Call the stake API
              const result = await fetch(url);
              return await result.json();
          };

          const fetchedTX = await fetchVaultTransaction();
          const serializedTxBase64 = fetchedTX.transaction;

          const tx = VersionedTransaction.deserialize(
            Buffer.from(serializedTxBase64, "base64")
          );

          // useWallet way
          const szTx = tx.serialize();

          const transactionDecoder = getTransactionDecoder();
          const decodedTransaction = transactionDecoder.decode(szTx);

          // leverages the wallet's transaction sending signer and rpc
          const rawSignature =
            await transactionSendingSigner.signAndSendTransactions([
              decodedTransaction
            ]);
          const signature = getBase58Decoder().decode(rawSignature[0]);

          // ===========================
          // === CONFIRM TRANSACTION ===
          // ===========================

          // Call the new confirmation API endpoint
          await confirmTransaction(network, {
            txid: signature,
            targetCommitment: "processed",
            timeout: 30000,
            interval: 1000,
          });
          setVaultSignature(signature);    

      } catch (error) {
        console.error("Staking error:", error);
        setCurrentError(error as symbol);
      } finally {
        setIsSubmittingTransaction(false);
      }
    },
    [account, transactionSendingSigner, NO_ERROR]
  );

  const handleVaultCloseModal = useCallback(() => {
    setVaultSignature(undefined);
    onSuccess();
  }, [onSuccess]);

  // Trigger success modal when transaction completes
  useEffect(() => {
    if (vaultSignature) {
      showSuccessModal({
        title: "Congratulations!",
        message: "Your Vault Stake has been activated and has started to earn rewards!",
        signature: vaultSignature,
        onClose: () => {
          handleVaultCloseModal();
        },
      });
    } else {
      hideSuccessModal();
    }
  }, [vaultSignature, showSuccessModal, hideSuccessModal, handleVaultCloseModal]);

  const stakeAmountValue = parseFloat(stakeAmount) || 0;
  const isStakeAmountZero = stakeAmountValue <= 0;
  const stakeButtonDisabled = isSubmittingTransaction || inSufficientBalance || isStakeAmountZero;
  const stakeBtnLabel = isSubmittingTransaction
    ? "Confirming Transaction"
    : inSufficientBalance
      ? "Insufficient Balance"
      : isStakeAmountZero
        ? "Enter stake amount"
        : "Stake";

  return (
    <StakeButtonBase
      buttonLabel={stakeBtnLabel}
      disableStakeButton={stakeButtonDisabled}
      isSendingTransaction={isSubmittingTransaction}
      handleSubmit={handleVaultSubmit}
      error={currentError !== NO_ERROR ? currentError : undefined}
    />
  );
}
