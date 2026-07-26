import { getBase58Decoder } from "@solana/kit";

interface SerializableTransaction {
  serialize(): Parameters<ReturnType<typeof getBase58Decoder>["decode"]>[0];
}

interface PriorityFeeEstimate {
  priorityFeeEstimate: number;
}

interface PriorityFeeResponse {
  result: PriorityFeeEstimate;
}

export async function getPriorityFeeEstimate(
  priorityLevel: string,
  transaction: SerializableTransaction,
  heliusUrl: string
): Promise<PriorityFeeEstimate> {
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
  const data = (await response.json()) as PriorityFeeResponse;
  return data.result;
}
