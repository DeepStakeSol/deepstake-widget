import {
  address,
  getAddressEncoder,
  getBase64Encoder,
  getProgramDerivedAddress,
  type Address,
  type Rpc,
  type SolanaRpcApi
} from "@solana/kit";
import { deserializeDigitalAsset } from "@metaplex-foundation/mpl-token-metadata";

const TOKEN_METADATA_PROGRAM_ADDRESS = address(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);

type UmiRpcAccount = Parameters<typeof deserializeDigitalAsset>[0];

function decodeBase64(data: readonly [string, "base64"]): Uint8Array {
  return new Uint8Array(getBase64Encoder().encode(data[0]));
}

function toUmiAccount(
  accountAddress: Address,
  account: {
    executable: boolean;
    lamports: bigint;
    owner: Address;
    data: readonly [string, "base64"];
  }
): UmiRpcAccount {
  return {
    publicKey: accountAddress,
    executable: account.executable,
    owner: account.owner,
    lamports: {
      basisPoints: account.lamports,
      identifier: "SOL",
      decimals: 9
    },
    data: decodeBase64(account.data)
  } as unknown as UmiRpcAccount;
}

export const getMetadata = async (mint: string, rpc: Rpc<SolanaRpcApi>) => {
  try {
    const mintAddress = address(mint);
    const [metadataAddress] = await getProgramDerivedAddress({
      programAddress: TOKEN_METADATA_PROGRAM_ADDRESS,
      seeds: [
        "metadata",
        getAddressEncoder().encode(TOKEN_METADATA_PROGRAM_ADDRESS),
        getAddressEncoder().encode(mintAddress)
      ]
    });
    const { value: accounts } = await rpc
      .getMultipleAccounts([mintAddress, metadataAddress], {
        commitment: "confirmed",
        encoding: "base64"
      })
      .send();
    const [mintAccount, metadataAccount] = accounts;
    if (!mintAccount || !metadataAccount) return undefined;

    const data = deserializeDigitalAsset(
      toUmiAccount(mintAddress, mintAccount),
      toUmiAccount(metadataAddress, metadataAccount)
    );
    const dataFromUrl = (await fetch(data.metadata.uri).then((response) =>
      response.json()
    )) as { image: string };

    return { ...data, imageUrl: dataFromUrl.image };
  } catch {
    return undefined;
  }
};
