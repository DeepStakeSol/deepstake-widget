import { Button, Flex } from "@radix-ui/themes";
import { ErrorDialog } from "../ErrorDialog";
import React, { useEffect } from "react";
import {
  centerFlex,
  gap8,
} from "../../utils/styles";
import { useStakingModal } from "../../context/StakingModalContext";

interface StakeButtonBaseProps {
  buttonLabel: string;
  disableStakeButton: boolean;
  isSendingTransaction: boolean;
  handleSubmit: (e: React.MouseEvent<HTMLButtonElement>) => void;
  error?: unknown;
  children?: React.ReactNode;
}

export function StakeButtonBase({
  buttonLabel,
  disableStakeButton,
  isSendingTransaction,
  handleSubmit,
  error,
  children,
}: StakeButtonBaseProps) {
  const { showStakingModal, hideStakingModal } = useStakingModal();

  useEffect(() => {
    if (isSendingTransaction) {
      showStakingModal();
    } else {
      hideStakingModal();
    }
  }, [isSendingTransaction, showStakingModal, hideStakingModal]);

  return (
    <>
      <Button
        type="button"
        size="3"
        className="stake-button"
        style={{
          width: "100%",
          cursor: isSendingTransaction ? "default" : "pointer",

          borderRadius: "12px",
          border: "none",
          fontSize: "16px",
          fontWeight: 500,
          marginBottom: "10px",
          height: "36px",
        }}
        onClick={handleSubmit}
        disabled={disableStakeButton}
      >
        <div
          style={{
            ...centerFlex,
            ...gap8,
          }}
        >
          <span>{buttonLabel}</span>
        </div>
      </Button>

      {children}

      {error && (
        <ErrorDialog
          error={error}
          onClose={() => {
            /* parent may clear error */
          }}
          title="Staking failed"
        />
      )}

      <style>{`
        .stake-button {
          background: #5A5A62;
          color: #fff;
        }

        #root[data-theme="dark"] .stake-button {
          background: #D9D9D9;
          color: #000;
        }
      `}</style>
    </>
  );
}
