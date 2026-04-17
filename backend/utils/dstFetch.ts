import {
  DST_PROGRAM_ID,
  dstInfoParser,
  findDSTInfoAddress,
} from "@thevault/dst";
import { type Connection } from "@solana/web3.js";
import { directorParser, findDirectorAddress } from '@thevault/directed-stake';

export async function getAllDSTs(connection: Connection) {
  const info = (await connection.getProgramAccounts(DST_PROGRAM_ID))
    .map((account) => {
      const data = dstInfoParser.parse(Buffer.from(account.account.data));
      return {
        address: account.pubkey,
        data: data,
      };
    })
    .map((account) => {
      const dstAddress = findDSTInfoAddress(account.data.tokenMint);
      const directorAddress = findDirectorAddress(dstAddress);
      return { ...account, directorAddress };
    });

  // batch call on director addresses
  const directors = (
    await connection.getMultipleAccountsInfo(
      info.map((account) => account.directorAddress),
    )
  ).map((account, i) => {
    if (!account) {
      return undefined;
    }

    const data = directorParser.parse(Buffer.from(account.data));
    return {
      address: info[i].directorAddress,
      data: data,
    };
  });

  // Merge arrays
  return info.map((account) => {
    const director = directors.find(
      (director) =>
        director?.address.toString() === account.directorAddress.toString(),
    );
    return { ...account, director: director?.data };
  });
}
