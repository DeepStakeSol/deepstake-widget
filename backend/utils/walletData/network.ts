export type WalletNetwork = "mainnet" | "devnet";

export function parseWalletNetwork(
  value: string | null,
  fallback: WalletNetwork
): WalletNetwork | null {
  const network = value ?? fallback;
  return network === "mainnet" || network === "devnet" ? network : null;
}
