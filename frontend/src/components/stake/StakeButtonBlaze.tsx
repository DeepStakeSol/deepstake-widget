import { useCallback, useEffect, useRef, useState } from "react";
import { UiWalletAccount } from "@wallet-standard/react";
import { useWalletAccountTransactionSendingSigner } from "@solana/react";
import { StakeButtonBase } from "./StakeButtonBase";
import { useStakingModal } from "../../context/StakingModalContext";
import { getBase58Decoder, getTransactionDecoder } from "@solana/kit";
import { getCurrentChain } from "../../utils/config";
import { confirmTransaction, generateBlazeStakeTransaction, fetchLSTBalance } from "../../utils/api";

import { LAMPORTS_PER_SOL } from "@solana/web3.js";

const BSOL_MINT = "bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1";

interface StakeButtonProps {
  network: string;
  account: UiWalletAccount;
  stakeAmount: string;
  inSufficientBalance: boolean;
  onSuccess: () => void;
  onDataLoaded: (bSOLBalance: number) => void;
  onBSOLIsLoading: (isLoading: boolean) => void;
  voteIdentity?: string;
}

const sleep = (ms: number) =>
  new Promise<void>(resolve => setTimeout(resolve, ms));


export function StakeButtonBlaze({
  network,
  account,
  stakeAmount,
  inSufficientBalance,
  onSuccess,
  onDataLoaded,
  onBSOLIsLoading,
  voteIdentity,
}: StakeButtonProps) {
  const { showSuccessModal, hideSuccessModal } = useStakingModal();
  const currentChain = getCurrentChain();
  const transactionSendingSigner = useWalletAccountTransactionSendingSigner(
    account,
    currentChain
  );

  const [isSubmittingTransaction, setIsSubmittingTransaction] = useState(false);
  const [blazeSignature, setBlazeSignature] = useState<string | undefined>();
  const { current: NO_ERROR } = useRef(Symbol());
  const [currentError, setCurrentError] = useState(NO_ERROR);

  const handleBlazeSubmit = useCallback(
    async (evt: React.MouseEvent<HTMLButtonElement>) => {
      evt.preventDefault();

      if (!stakeAmount || !transactionSendingSigner) return;

      setCurrentError(NO_ERROR);
      setIsSubmittingTransaction(true);
      setBlazeSignature(undefined);

      try {
        const stakeLamportsAmount = Math.floor(
          parseFloat(stakeAmount) * LAMPORTS_PER_SOL
        );

        const txBase64 = await generateBlazeStakeTransaction(network, {
          wallet: account.address,
          stakeLamports: stakeLamportsAmount,
          voteIdentity,
        });

        const txBytes = Uint8Array.from(Buffer.from(txBase64, "base64"));
        const decodedTransaction = getTransactionDecoder().decode(txBytes);

        const rawSignature = await transactionSendingSigner.signAndSendTransactions([
          decodedTransaction,
        ]);
        const signature = getBase58Decoder().decode(rawSignature[0]);

        await confirmTransaction(network, {
          txid: signature,
          targetCommitment: "processed",
          timeout: 30000,
          interval: 1000,
        });

        if (voteIdentity) {
          try {
            await fetch(
              `https://stake.solblaze.org/api/v1/cls_stake?validator=${voteIdentity}&txid=${signature}`
            );
          } catch (clsError) {
            console.error("Failed to register CLS stake:", clsError);
          }
        }

        setBlazeSignature(signature);
      } catch (error) {
        console.error("Staking error:", error);
        setCurrentError(error as symbol);
      } finally {
        setIsSubmittingTransaction(false);

        onBSOLIsLoading(true);
        await sleep(10000);
        const bSOLBalance = await fetchLSTBalance(account.address, network, BSOL_MINT);
        onDataLoaded(bSOLBalance);
        onBSOLIsLoading(false);
      }
    },
    [account, transactionSendingSigner, NO_ERROR]
  );

  const handleBlazeCloseModal = useCallback(() => {
    setBlazeSignature(undefined);
    onSuccess();
  }, [onSuccess]);

  // Trigger success modal when transaction completes
  useEffect(() => {
    if (blazeSignature) {
      showSuccessModal({
        title: "Congratulations!",
        message: "Your Blaze Stake has been activated and has started to earn rewards!",
        signature: blazeSignature,
        onClose: () => {
          handleBlazeCloseModal();
        },
      });
    } else {
      hideSuccessModal();
    }
  }, [blazeSignature, showSuccessModal, hideSuccessModal, handleBlazeCloseModal]);

  const stakeAmountNumber = parseFloat(stakeAmount) || 0;
  const isZeroStake = stakeAmountNumber <= 0;
  const disableStakeButton = isSubmittingTransaction || inSufficientBalance || isZeroStake;
  const buttonLabel = isSubmittingTransaction
    ? "Confirming Transaction"
    : inSufficientBalance
      ? "Insufficient Balance"
      : isZeroStake
        ? "Enter stake amount"
        : "Stake";

  return (
    <StakeButtonBase
      buttonLabel={buttonLabel}
      disableStakeButton={disableStakeButton}
      isSendingTransaction={isSubmittingTransaction}
      handleSubmit={handleBlazeSubmit}
      error={currentError !== NO_ERROR ? currentError : undefined}
    />
  );
}
