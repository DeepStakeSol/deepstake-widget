import {
  address,
  getBase64Encoder,
  type Rpc,
  type SolanaRpcApi
} from "@solana/kit";

import {
  decodeDirectorAccount,
  DIRECTED_STAKE_PROGRAM_ADDRESS,
  findDirectorAddress
} from "./solana/vault/instructions";

const ZERO_KEY = address("11111111111111111111111111111111");

export async function getVaultBinding(wallet: string, rpc: Rpc<SolanaRpcApi>) {
  const pda = await findDirectorAddress(address(wallet));
  const { value: info } = await rpc
    .getAccountInfo(pda, { commitment: "confirmed", encoding: "base64" })
    .send();

  if (!info || info.owner !== DIRECTED_STAKE_PROGRAM_ADDRESS) {
    return { hasBinding: false };
  }

  try {
    const director = decodeDirectorAccount(
      new Uint8Array(getBase64Encoder().encode(info.data[0]))
    );
    if (director.stakeTarget === ZERO_KEY) {
      return { hasBinding: false };
    }
    return { hasBinding: true, stakeTarget: director.stakeTarget };
  } catch {
    return { hasBinding: false };
  }
}
