import { useCallback, useEffect, useRef, useState } from "react";
import { UiWalletAccount } from "@wallet-standard/react";
import { useWalletAccountTransactionSigner } from "@solana/react";
import {
  getBase64EncodedWireTransaction,
  getTransactionDecoder,
} from "@solana/kit";
import { getCurrentChain } from "../../utils/config";
import { createRpcConnection } from "../../utils/solana/rpc";
import { StakeButtonBase } from "./StakeButtonBase";
import { useStakingModal } from "../../context/StakingModalContext";

import * as solanaWeb3 from '@solana/web3.js';

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
  const walletSigner = useWalletAccountTransactionSigner(
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
                  
      if (!stakeAmount || !walletSigner) return;

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
          const { transaction: serializedTxBase64 } = fetchedTX;

          const txBytes = Uint8Array.from(Buffer.from(serializedTxBase64, "base64"));
          const decodedTransaction = getTransactionDecoder().decode(txBytes);
          const [walletSignedTx] = await walletSigner.modifyAndSignTransactions([decodedTransaction]);
          const rpc = createRpcConnection(network);
          const signature = await rpc.sendTransaction(
            getBase64EncodedWireTransaction(walletSignedTx),
            { encoding: "base64" }
          ).send();

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
    [account, walletSigner, NO_ERROR]
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
