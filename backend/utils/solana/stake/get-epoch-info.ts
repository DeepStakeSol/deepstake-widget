import { type Rpc, type SolanaRpcApi } from "@solana/kit";
import {
  type FixedSizeCodec,
  getU64Codec,
  getStructCodec,
} from "@solana/kit";

interface GetEpochInfoInput {
  rpc: Rpc<SolanaRpcApi>;
}

export interface GetEpochInfoResponse {
  epoch: number;
  slotIndex: number;
  slotsInEpoch: number;
  absoluteSlot: number;
}

export async function getEpochInfo({
  rpc
}: GetEpochInfoInput): Promise<GetEpochInfoResponse> {
  let epochInfo = await rpc.getEpochInfo().send();

  return {
    epoch: epochInfo ? Number(epochInfo.epoch) : 0,
    slotIndex: epochInfo ? Number(epochInfo.slotIndex) : 0,
    slotsInEpoch: epochInfo ? Number(epochInfo.slotsInEpoch) : 0,
    absoluteSlot: epochInfo ? Number(epochInfo.absoluteSlot) : 0,
  };
}

export interface EpochInfo {
  epoch: bigint;
  slotIndex: bigint;
  slotsInEpoch: bigint;
  absoluteSlot: bigint;
}

export const epochInfoCodec: FixedSizeCodec<EpochInfo> = getStructCodec([
  ["epoch", getU64Codec()],
  ["slotIndex", getU64Codec()],
  ["slotsInEpoch", getU64Codec()],
  ["absoluteSlot", getU64Codec()],
]);
