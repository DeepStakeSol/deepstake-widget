import {
  address,
  getBase64Encoder,
  type Address,
  type Rpc,
  type SolanaRpcApi
} from "@solana/kit";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";

import { JSOL_MINT } from "@/utils/consts";
import {
  decodeStakePoolAccount,
  decodeStakePoolSolDepositConfig,
  STAKE_POOL_PROGRAM_ADDRESS,
  type StakePoolAccount,
  type StakePoolSolDepositConfig
} from "@/utils/solana/blaze/stake-pool";

import { JpoolRouteError } from "./errors";

export type JpoolStakePool = StakePoolAccount & StakePoolSolDepositConfig;

type EncodedAccount = {
  owner: Address;
  data: readonly [string, "base64"] | [string, "base64"];
} | null;

export function decodeBase64AccountData(
  data: readonly [string, "base64"] | [string, "base64"]
): Uint8Array {
  return new Uint8Array(getBase64Encoder().encode(data[0]));
}

// Validates the pool account before any of its addresses are trusted in a
// transaction: program owner, JSOL mint, and the classic SPL Token program.
export function parseJpoolStakePool(account: EncodedAccount): JpoolStakePool {
  if (!account || account.owner !== STAKE_POOL_PROGRAM_ADDRESS) {
    throw new JpoolRouteError("JPOOL_POOL_INVALID", 500);
  }

  try {
    const bytes = decodeBase64AccountData(account.data);
    const pool = {
      ...decodeStakePoolAccount(bytes),
      ...decodeStakePoolSolDepositConfig(bytes)
    };
    if (
      pool.poolMint !== address(JSOL_MINT) ||
      pool.tokenProgram !== TOKEN_PROGRAM_ADDRESS
    ) {
      throw new Error("Unexpected JPool mint or token program");
    }
    return pool;
  } catch (error) {
    throw new JpoolRouteError("JPOOL_POOL_INVALID", 500, {
      reason: error instanceof Error ? error.message : String(error)
    });
  }
}

export async function fetchJpoolStakePool(
  rpc: Rpc<SolanaRpcApi>,
  poolAddress: Address
): Promise<JpoolStakePool> {
  let account: EncodedAccount;
  try {
    ({ value: account } = await rpc
      .getAccountInfo(poolAddress, {
        commitment: "confirmed",
        encoding: "base64"
      })
      .send());
  } catch {
    throw new JpoolRouteError("JPOOL_RPC_UNAVAILABLE", 503);
  }
  return parseJpoolStakePool(account);
}
