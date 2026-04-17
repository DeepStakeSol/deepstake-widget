import { type Rpc, type SolanaRpcApi } from "@solana/kit";
import {
  type FixedSizeCodec,
  getU64Codec,
  getStructCodec,
} from "@solana/kit";


interface GetRecentPerformanceSamplesInput {
  rpc: Rpc<SolanaRpcApi>;
  limit?: number; // default to 1
}

export interface PerformanceSample {
  slot: number;
  numTransactions: number;
  numSlots: number;
  samplePeriodSecs: number;
}

export interface GetRecentPerformanceSamplesResponse {
  samples: PerformanceSample[];
}

export async function getRecentPerformanceSamples({
  rpc,
  limit = 1,
}: GetRecentPerformanceSamplesInput): Promise<GetRecentPerformanceSamplesResponse> {
  const result = await rpc
    .getRecentPerformanceSamples(limit)
    .send();

  return {
    samples: (result ?? []).map((sample) => ({
      slot: Number(sample.slot),
      numTransactions: Number(sample.numTransactions),
      numSlots: Number(sample.numSlots),
      samplePeriodSecs: Number(sample.samplePeriodSecs),
    })),
  };
}

export interface PerformanceSampleCodecType {
  slot: bigint;
  numTransactions: bigint;
  numSlots: bigint;
  samplePeriodSecs: bigint;
}

export const performanceSampleCodec: FixedSizeCodec<PerformanceSampleCodecType> =
  getStructCodec([
    ["slot", getU64Codec()],
    ["numTransactions", getU64Codec()],
    ["numSlots", getU64Codec()],
    ["samplePeriodSecs", getU64Codec()],
  ]);


