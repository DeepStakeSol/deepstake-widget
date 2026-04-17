"use client";

import { createContext, useContext, useState, ReactNode } from "react";

interface BalanceCheckContextType {
  triggerCheck: boolean;
  setTriggerCheck: (value: boolean) => void;
}

const BalanceCheckContext = createContext<BalanceCheckContextType | undefined>(undefined);

export function BalanceCheckProvider({ children }: { children: ReactNode }) {
  const [triggerCheck, setTriggerCheck] = useState(false);

  return (
    <BalanceCheckContext.Provider value={{ triggerCheck, setTriggerCheck }}>
      {children}
    </BalanceCheckContext.Provider>
  );
}

export function useBalanceCheck() {
  const ctx = useContext(BalanceCheckContext);
  if (!ctx) {
    throw new Error("useBalanceCheck must be used within BalanceCheckProvider");
  }
  return ctx;
}
