import { type Connection, PublicKey } from "@solana/web3.js";
import { type StakePoolAccount, StakePoolLayout } from "@solana/spl-stake-pool";
import { STAKE_POOL_ADDRESS } from "./consts";
async function getStakePoolAccount(
  connection: Connection,
  stakePoolAddress: PublicKey,
): Promise<StakePoolAccount> {
  const account = await connection.getAccountInfo(stakePoolAddress);

  if (!account) {
    throw new Error("Invalid stake pool account");
  }

  return {
    pubkey: stakePoolAddress,
    account: {
      data: StakePoolLayout.decode(account.data),
      executable: account.executable,
      lamports: account.lamports,
      owner: account.owner,
    },
  };
}

export const getStakePoolInfo = async (connection: Connection) => {
  const info = await getStakePoolAccount(
    connection,
    new PublicKey(STAKE_POOL_ADDRESS),
  );
  return {
    totalSupply: info.account.data.poolTokenSupply.toString(),
    totalSOL: info.account.data.totalLamports.toString(),
  };
};
