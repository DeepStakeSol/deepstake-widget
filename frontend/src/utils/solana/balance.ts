import { fetchSolBalance } from "../api";

export interface NetworkBalanceInfo {
  network: string;
  balanceInSOL: number;
}

export async function checkOtherNetworkBalances(
  walletAddress: string,
  currentNetwork: string
): Promise<NetworkBalanceInfo | null> {
  const networks = ["mainnet", "devnet"];

  for (const network of networks) {
    if (network === currentNetwork) continue;

    try {
      const solBalance = await fetchSolBalance(walletAddress, network);
      if (solBalance > 0) {
        return { network, balanceInSOL: solBalance };
      }
    } catch {
      // continue checking other networks
    }
  }

  return null;
}
