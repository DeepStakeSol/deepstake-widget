import { invalidateWalletData } from "./service";
import type { WalletDataResource } from "./cache";

export const WALLET_MUTATIONS = [
  "native-stake",
  "native-unstake",
  "native-withdraw",
  "blaze-stake",
  "vault-stake"
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
  if (mutation.startsWith("native-")) return "native-stake";
  if (mutation === "blaze-stake") return "blaze-applied";
  return "vault-manage";
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
