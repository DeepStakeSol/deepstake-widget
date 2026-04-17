import { useEffect } from "react";
import { GetStakeAccountResponse } from "../../utils/solana/stake/get-stake-accounts";
import { useStakeTransaction } from "../../hooks/useStakeTransaction";
import { StakeButtonBase } from "./StakeButtonBase";
import { useStakingModal } from "../../context/StakingModalContext";
import type { UiWalletAccount } from "@wallet-standard/react";

interface StakeButtonProps {
  network: string;
  account: UiWalletAccount;
  stakeAmount: string;
  inSufficientBalance: boolean;
  onSuccess: () => void;
  onDataLoaded: (stakeAccounts: GetStakeAccountResponse[]) => void;
}


export function StakeButton({
  network,
  account,
  stakeAmount,
  inSufficientBalance,
  onSuccess,
  onDataLoaded,
}: StakeButtonProps) {
  const { showSuccessModal, hideSuccessModal } = useStakingModal();
  const {
    isSendingTransaction,
    lastSignature,
    lastStakeAccount,
    error,
    disableStakeButton,
    buttonLabel,
    handleSubmit,
    handleCloseModal,
  } = useStakeTransaction({
    network,
    account,
    stakeAmount,
    inSufficientBalance,
    onSuccess,
    onDataLoaded,
  });

  // Trigger success modal when transaction completes
  useEffect(() => {
    if (lastSignature) {
      showSuccessModal({
        title: "Stake Account Created!",
        message: "Your stake is activating and will be earning rewards next epoch!",
        signature: lastSignature,
        onClose: () => {
          handleCloseModal();
        },
      });
    } else {
      hideSuccessModal();
    }
  }, [lastSignature, showSuccessModal, hideSuccessModal, handleCloseModal]);

  return (
    <StakeButtonBase
      buttonLabel={buttonLabel}
      disableStakeButton={disableStakeButton}
      isSendingTransaction={isSendingTransaction}
      handleSubmit={handleSubmit}
      error={error}
    />
  );
}
