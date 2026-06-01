import { createContext, useContext } from "react";

export type WidgetTab = "native" | "blaze" | "vault";

export interface Options {
  vote_account: string;
  network?: "mainnet" | "devnet";
  theme?: "light" | "dark";
  tabs?: WidgetTab[];
}

export const OptionsContext = createContext<Options | null>(null);

export function useOptions(): Options | null {
  return useContext(OptionsContext);
}
