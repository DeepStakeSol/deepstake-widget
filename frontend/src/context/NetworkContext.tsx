import { createContext, useContext, useState, ReactNode } from "react";
import { NetworkType } from "../utils/network";

type NetworkContextType = {
  network: NetworkType;
  setNetwork: (n: NetworkType) => void;
};

const NetworkContext = createContext<NetworkContextType | undefined>(undefined);

export const NetworkProvider = ({ children }: { children: ReactNode }) => {
  const [network, setNetwork] = useState<NetworkType>("mainnet");

  return (
    <NetworkContext.Provider value={{ network, setNetwork }}>
      {children}
    </NetworkContext.Provider>
  );
};

export const useNetwork = () => {
  const ctx = useContext(NetworkContext);
  if (!ctx) throw new Error("useNetwork must be used inside NetworkProvider");
  return ctx;
};
