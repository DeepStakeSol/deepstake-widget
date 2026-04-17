import { Button } from "@radix-ui/themes";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { UiWalletAccount } from "@wallet-standard/react";
import { useWalletAccountTransactionSendingSigner } from "@solana/react";
import {
  getBase58Decoder,
  getBase64Encoder,
  getTransactionDecoder,
} from "@solana/kit";
import { generateWithdrawTransaction, confirmTransaction } from "../../utils/api";
import { invalidateStakeAccountsCache } from "../../utils/stakeAccountsCache";
import { getCurrentChain } from "../../utils/config";
import { ErrorDialog } from "../ErrorDialog";
import { useStakingModal } from "../../context/StakingModalContext";

import { GetStakeAccountResponse } from "../../utils/solana/stake/get-stake-accounts";

interface WithdrawButtonProps {
  network: string;
  account: UiWalletAccount;
  //inSufficientBalance: boolean;
  onSuccess: () => void;
  selectedRow: GetStakeAccountResponse | null;
  isDisabled: boolean;
}

// backend helpers imported below

export function WithdrawButton({
  network,
  account,
  onSuccess,
  selectedRow,
  isDisabled,
}: WithdrawButtonProps) {
  const { showTransactionModal, hideTransactionModal, showSuccessModal, hideSuccessModal } = useStakingModal();
  const currentChain = getCurrentChain();
  const transactionSendingSigner = useWalletAccountTransactionSendingSigner(
    account,
    currentChain
  );
  const [isSendingTX, setIsSendingTX] = useState(false);
  const [txSignature, setTxSignature] = useState<string | undefined>();
  const [stakeAcct, setStakeAcct] = useState<string | undefined>();
  const { current: NO_ERROR } = useRef(Symbol());
  const [error, setError] = useState(NO_ERROR);

  const handleWithdrawSubmit = useCallback(
    async (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      if (!transactionSendingSigner) return;

      if (!selectedRow) return;
      alert(`Withdrawing from: ${selectedRow.address}`);

      setError(NO_ERROR);
      setIsSendingTX(true);
      setTxSignature(undefined);
      showTransactionModal();

      try {

        // Step 1: Generate the transaction message
        const wireTransaction = await generateWithdrawTransaction(network, {
          stakeAccountAddress: selectedRow.address,
          recipientAccountAddress: account.address,
        });

        const base64Encoder = getBase64Encoder();
        const transactionBytes = base64Encoder.encode(wireTransaction);
        const transactionDecoder = getTransactionDecoder();
        const decodedTransaction = transactionDecoder.decode(transactionBytes);

        // leverages the wallet's transaction sending signer and rpc
        const rawSignature =
          await transactionSendingSigner.signAndSendTransactions([
            decodedTransaction
          ]);
        const signature = getBase58Decoder().decode(rawSignature[0]);

        // Call the new confirmation API endpoint
        await confirmTransaction(network, {
          txid: signature,
          targetCommitment: "processed",
          timeout: 30000,
          interval: 1000,
        });

        setTxSignature(signature);

      } catch (error) {
        console.error("UnStaking error:", error);
        setError(error as symbol);
        setStakeAcct(undefined);
      } finally {
        setIsSendingTX(false);
        hideTransactionModal();
        // Invalidate cache so the next fetch gets fresh data
        invalidateStakeAccountsCache(account.address, network);
      }
    },
    [account, network, transactionSendingSigner, NO_ERROR, showTransactionModal, hideTransactionModal]
  );

  const handleCloseModal = useCallback(() => {
    setTxSignature(undefined);
    setStakeAcct(undefined);
    onSuccess();
  }, [onSuccess]);

  // Trigger success modal when transaction completes
  useEffect(() => {
    if (txSignature) {
      showSuccessModal({
        title: "Transaction confirmed!",
        message: "Your funds is already at your wallet.",
        signature: txSignature,
        onClose: () => {
          handleCloseModal();
        },
      });
    } else {
      hideSuccessModal();
    }
  }, [txSignature, showSuccessModal, hideSuccessModal, handleCloseModal]);

  const disableUnstakeButton = isDisabled;
  const buttonLabel = isSendingTX
    ? "Confirming Transaction"
    : "Withdraw";

  return (
    <>
      <Button
        type="button"
        size="3"
        className="action-button"
        onClick={handleWithdrawSubmit}
        disabled={disableUnstakeButton}
      >
       <span>{buttonLabel}</span>
      </Button>

      {error !== NO_ERROR && (
        <ErrorDialog
          error={error}
          onClose={() => setError(NO_ERROR)}
          title="Withdrawal failed"
        />
      )}

      <style>{`
        .action-button {
          border-radius: 10px;
          border: none;
          background: #5A5A62;
          color: #fff;
          font-size: 12px;
          font-weight: 600;
          height: 40px;
        }

        .action-button:disabled {
          background: #e5e7eb;
          color: #9ca3af;
          cursor: not-allowed;
        }
      `}</style>
    </>
  );
}
