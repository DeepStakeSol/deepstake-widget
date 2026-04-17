"use client";

import { ReactNode } from "react";
import { BalanceCheckProvider as BalanceCheckContextProvider } from "../context/BalanceCheckContext";
import { NetworkBalanceAlert } from "../components/NetworkBalanceAlert";

export function BalanceCheckProvider({ children }: { children: ReactNode }) {
  return (
    <BalanceCheckContextProvider>
      {children}
      <NetworkBalanceAlert />
    </BalanceCheckContextProvider>
  );
}
