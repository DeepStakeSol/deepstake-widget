import { invalidateWalletData } from "./service";
import type { WalletDataResource } from "./cache";

export const WALLET_MUTATIONS = [
  "native-stake",
  "native-unstake",
  "native-withdraw",
  "blaze-stake",
  "vault-stake",
  "jpool-stake"
] as const;

export type WalletMutation = (typeof WALLET_MUTATIONS)[number];

export interface CacheMutationContext {
  walletAddress: string;
  mutation: WalletMutation;
}

export function isWalletMutation(value: unknown): value is WalletMutation {
  return (
    typeof value === "string" &&
    WALLET_MUTATIONS.includes(value as WalletMutation)
  );
}

export function resourceForMutation(
  mutation: WalletMutation
): WalletDataResource {
  switch (mutation) {
    case "native-stake":
    case "native-unstake":
    case "native-withdraw":
      return "native-stake";
    case "blaze-stake":
      return "blaze-applied";
    case "vault-stake":
      return "vault-manage";
    case "jpool-stake":
      // Marker invalidation: covers every vote-scoped record of the wallet.
      return "jpool-manage";
    default: {
      // A new mutation must be mapped explicitly, never fall through.
      const unknown: never = mutation;
      throw new Error(`Unknown wallet mutation: ${String(unknown)}`);
    }
  }
}

export function invalidateMutationData(
  network: string,
  context: CacheMutationContext
): Promise<boolean> {
  return invalidateWalletData(
    resourceForMutation(context.mutation),
    network,
    context.walletAddress
  );
}
