import { findDirectorAddress, DIRECTED_STAKE_PROGRAM_ID } from "@thevault/directed-stake";
import { Connection, PublicKey } from "@solana/web3.js";

const ZERO_KEY = "11111111111111111111111111111111";

export async function getVaultBinding(wallet: string, connection: Connection) {
  const pda = findDirectorAddress(new PublicKey(wallet));
  const info = await connection.getAccountInfo(pda);

  if (!info || !info.owner.equals(DIRECTED_STAKE_PROGRAM_ID) || info.data.length < 40) {
    return { hasBinding: false };
  }

  const stakeTarget = new PublicKey(info.data.slice(8, 40));
  if (stakeTarget.toBase58() === ZERO_KEY) {
    return { hasBinding: false };
  }

  return { hasBinding: true, stakeTarget: stakeTarget.toBase58() };
}
