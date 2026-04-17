"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";

interface SuccessModalData {
  title: string;
  message: string;
  signature?: string;
  onClose?: () => void;
}

type ModalType = "staking" | "transaction" | null;

interface StakingModalContextType {
  showStakingModal: () => void;
  hideStakingModal: () => void;
  isShowing: boolean;
  showTransactionModal: () => void;
  hideTransactionModal: () => void;
  isTransactionShowing: boolean;
  showSuccessModal: (data: SuccessModalData) => void;
  hideSuccessModal: () => void;
  successData: SuccessModalData | null;
  showWalletModal: () => void;
  hideWalletModal: () => void;
  isWalletShowing: boolean;
}

const StakingModalContext = createContext<StakingModalContextType | undefined>(undefined);

export function StakingModalProvider({ children }: { children: ReactNode }) {
  const [isShowing, setIsShowing] = useState(false);
  const [isTransactionShowing, setIsTransactionShowing] = useState(false);
  const [successData, setSuccessData] = useState<SuccessModalData | null>(null);
  const [isWalletShowing, setIsWalletShowing] = useState(false);

  const showStakingModal = useCallback(() => {
    setIsShowing(true);
  }, []);

  const hideStakingModal = useCallback(() => {
    setIsShowing(false);
  }, []);

  const showTransactionModal = useCallback(() => {
    setIsTransactionShowing(true);
  }, []);

  const hideTransactionModal = useCallback(() => {
    setIsTransactionShowing(false);
  }, []);

  const showSuccessModal = useCallback((data: SuccessModalData) => {
    setSuccessData(data);
  }, []);

  const hideSuccessModal = useCallback(() => {
    setSuccessData(null);
  }, []);

  const showWalletModal = useCallback(() => {
    setIsWalletShowing(true);
  }, []);

  const hideWalletModal = useCallback(() => {
    setIsWalletShowing(false);
  }, []);

  return (
    <StakingModalContext.Provider value={{ 
      showStakingModal, 
      hideStakingModal, 
      isShowing,
      showTransactionModal,
      hideTransactionModal,
      isTransactionShowing,
      showSuccessModal,
      hideSuccessModal,
      successData,
      showWalletModal,
      hideWalletModal,
      isWalletShowing
    }}>
      {children}
    </StakingModalContext.Provider>
  );
}

export function useStakingModal() {
  const context = useContext(StakingModalContext);
  if (context === undefined) {
    throw new Error("useStakingModal must be used within a StakingModalProvider");
  }
  return context;
}
