import { getBase58Decoder } from "@solana/kit";

import { DEFAULT_PRIORITY_FEE_MICRO_LAMPORTS } from "./constants";

interface SerializableTransaction {
  serialize(): Parameters<ReturnType<typeof getBase58Decoder>["decode"]>[0];
}

interface PriorityFeeEstimate {
  priorityFeeEstimate: number;
}

interface PriorityFeeResponse {
  result?: Partial<PriorityFeeEstimate>;
}

// getPriorityFeeEstimate is a Helius-only RPC method. Any other RPC (devnet),
// an HTTP or JSON failure, or a malformed estimate falls back to the default
// fee, so callers always get a whole number of micro-lamports and never a throw.
export async function getPriorityFeeEstimate(
  priorityLevel: string,
  transaction: SerializableTransaction,
  heliusUrl: string
): Promise<PriorityFeeEstimate> {
  try {
    const response = await fetch(heliusUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "1",
        method: "getPriorityFeeEstimate",
        params: [
          {
            transaction: getBase58Decoder().decode(transaction.serialize()),
            options: { priorityLevel }
          }
        ]
      })
    });
    if (!response.ok) return defaultEstimate();

    const data = (await response.json()) as PriorityFeeResponse | null;
    const estimate = data?.result?.priorityFeeEstimate;
    if (typeof estimate !== "number" || !Number.isFinite(estimate) || estimate < 0) {
      return defaultEstimate();
    }
    return { priorityFeeEstimate: Math.ceil(estimate) };
  } catch {
    return defaultEstimate();
  }
}

function defaultEstimate(): PriorityFeeEstimate {
  return { priorityFeeEstimate: DEFAULT_PRIORITY_FEE_MICRO_LAMPORTS };
}
