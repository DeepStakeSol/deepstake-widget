import { Button } from "@radix-ui/themes";
import { useCallback, useEffect, useRef, useState } from "react";
import { UiWalletAccount } from "@wallet-standard/react";
import { useWalletAccountTransactionSendingSigner } from "@solana/react";
import {
  getBase58Decoder,
  getBase64Encoder,
  getTransactionDecoder,
} from "@solana/kit";
import { generateUnstakeTransaction, confirmTransaction } from "../../utils/api";
import { invalidateStakeAccountsCache } from "../../utils/stakeAccountsCache";
import { getCurrentChain } from "../../utils/config";
import { ErrorDialog } from "../ErrorDialog";
import { useStakingModal } from "../../context/StakingModalContext";

import { GetStakeAccountResponse } from "../../utils/solana/stake/get-stake-accounts";

interface StakeButtonProps {
  network: string;
  account: UiWalletAccount;
  //inSufficientBalance: boolean;
  onSuccess: () => void;
  selectedRow: GetStakeAccountResponse | null;
  isDisabled: boolean;
}

export function UnstakeButton({
  network,
  account,
  onSuccess,
  selectedRow,
  isDisabled,
}: StakeButtonProps) {
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

  const handleUnstakeSubmit = useCallback(
    async (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      if (!transactionSendingSigner) return;

      if (!selectedRow) return;
      alert(`Unstaking from: ${selectedRow.address}`);

      setError(NO_ERROR);
      setIsSendingTX(true);
      setTxSignature(undefined);
      showTransactionModal();
      try {
        const newAccountAddress = selectedRow.address;

        // Step 1: Generate the transaction message
        const wireTransaction = await generateUnstakeTransaction(network, {
          stakerAddress: account.address,
          stakeAccountAddress: newAccountAddress,
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
        message: "Your funds will become available for withdrawal at the end of the current epoch.",
        signature: txSignature,
        onClose: () => {
          handleCloseModal();
        },
      });
    } else {
      hideSuccessModal();
    }
  }, [txSignature, showSuccessModal, hideSuccessModal, handleCloseModal]);

  //const disableUnstakeButton = !selectedRow || selectedRow?.state ;
  const disableUnstakeButton = isDisabled;
  const buttonLabel = isSendingTX
    ? "Confirming Transaction"
    : "Unstake";

  return (
    <>
      <Button
        type="button"
        size="3"
        className="action-button"
        onClick={handleUnstakeSubmit}
        disabled={disableUnstakeButton}
      >
       <span>{buttonLabel}</span>
      </Button>

      {error !== NO_ERROR && (
        <ErrorDialog
          error={error}
          onClose={() => setError(NO_ERROR)}
          title="Unstaking failed"
        />
      )}

      <style>{`
        .action-button {
          cursor: pointer;
          border-radius: 10px;
          border: none;
          background: #5A5A62;
          color: #fff;
          font-size: 12px;
          font-weight: 600
          height: 40px;
        }

        .action-button:disabled {
          background: #e5e7eb;
          color: #9ca3af;
          cursor: not-allowed;
        }

        #root[data-theme="dark"] .action-button {
          background: #D9D9D9;
          color: #0D1625;
        }

        #root[data-theme="dark"] .action-button:disabled {
          background: #83848d;
          color: #5A5A62;
          cursor: not-allowed;
        }
      `}</style>
    </>
  );
}
