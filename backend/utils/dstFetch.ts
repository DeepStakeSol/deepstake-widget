import { getBase64Encoder, type Rpc, type SolanaRpcApi } from "@solana/kit";

import {
  decodeDirectorAccount,
  decodeDstInfoAccount,
  DST_PROGRAM_ADDRESS,
  findDirectorAddress,
  findDstInfoAddress
} from "./solana/vault/instructions";

function decodeBase64(data: readonly [string, "base64"]): Uint8Array {
  return new Uint8Array(getBase64Encoder().encode(data[0]));
}

export async function getAllDSTs(rpc: Rpc<SolanaRpcApi>) {
  const accounts = await rpc
    .getProgramAccounts(DST_PROGRAM_ADDRESS, {
      commitment: "confirmed",
      encoding: "base64"
    })
    .send();
  const info = await Promise.all(
    accounts.map(async (account) => {
      const data = decodeDstInfoAccount(decodeBase64(account.account.data));
      const dstAddress = await findDstInfoAddress(data.tokenMint);
      const directorAddress = await findDirectorAddress(dstAddress);
      return { address: account.pubkey, data, directorAddress };
    })
  );

  if (info.length === 0) return info;

  const { value: directorAccounts } = await rpc
    .getMultipleAccounts(
      info.map((account) => account.directorAddress),
      { commitment: "confirmed", encoding: "base64" }
    )
    .send();
  const directors = directorAccounts.map((account, index) => {
    if (!account) return undefined;
    try {
      return {
        address: info[index].directorAddress,
        data: decodeDirectorAccount(decodeBase64(account.data))
      };
    } catch {
      return undefined;
    }
  });

  return info.map((account) => {
    const director = directors.find(
      (candidate) => candidate?.address === account.directorAddress
    );
    return { ...account, director: director?.data };
  });
}
