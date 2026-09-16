import type { Rpc, SolanaRpcApi } from "@solana/kit";

import { LAMPORTS_PER_SOL, STAKE_PROGRAM } from "../../constants";

export const STAKE_MINIMUM_CACHE_TTL_MS = 15 * 60 * 1_000;

export interface StakeMinimum {
  network: string;
  minimumDelegation: number;
  rentExemptReserve: number;
  minimumStakeLamports: number;
  minimumStakeSol: number;
}

interface CacheEntry {
  expiresAt: number;
  value: StakeMinimum;
}

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<StakeMinimum>>();

export async function getStakeMinimum(
  network: string,
  rpc: Rpc<SolanaRpcApi>,
  now = Date.now
): Promise<StakeMinimum> {
  const cached = cache.get(network);
  const currentTime = now();
  if (cached && currentTime < cached.expiresAt) return cached.value;
  if (cached) cache.delete(network);

  const existing = inFlight.get(network);
  if (existing) return existing;

  const request = Promise.all([
    rpc
      .getMinimumBalanceForRentExemption(
        BigInt(STAKE_PROGRAM.STAKE_ACCOUNT_SPACE),
        { commitment: "confirmed" }
      )
      .send(),
    rpc.getStakeMinimumDelegation({ commitment: "confirmed" }).send()
  ])
    .then(([rentExemptReserve, { value: minimumDelegation }]) => {
      const minimumStakeLamports = rentExemptReserve + minimumDelegation;
      const value: StakeMinimum = {
        network,
        minimumDelegation: Number(minimumDelegation),
        rentExemptReserve: Number(rentExemptReserve),
        minimumStakeLamports: Number(minimumStakeLamports),
        minimumStakeSol: Number(minimumStakeLamports) / LAMPORTS_PER_SOL
      };
      cache.set(network, {
        expiresAt: now() + STAKE_MINIMUM_CACHE_TTL_MS,
        value
      });
      return value;
    })
    .finally(() => {
      inFlight.delete(network);
    });

  inFlight.set(network, request);
  return request;
}

export function clearStakeMinimumCache(): void {
  cache.clear();
  inFlight.clear();
}
