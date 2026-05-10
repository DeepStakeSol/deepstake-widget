export type WidgetTab = "native" | "blaze" | "vault";

export interface Options {
  vote_account: string;
  network?: "mainnet" | "devnet";
  theme?: "light" | "dark";
  tabs?: WidgetTab[];
}

let options: Options | null = null;

export function setOptions(value: Options) {
  options = value;
}

export function getOptions(): Options | null {
  return options;
}
