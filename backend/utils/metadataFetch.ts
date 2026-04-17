import { PublicKey } from "@solana/web3.js";
import { fromWeb3JsPublicKey } from "@metaplex-foundation/umi-web3js-adapters";
import {
  fetchDigitalAsset,
  mplTokenMetadata,
} from "@metaplex-foundation/mpl-token-metadata";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";

export const getMetadata = async (mint: string) => {
  const umi = createUmi(process.env.VITE_MAINNET_RPC_ENDPOINT!).use(mplTokenMetadata());
  try {
    const data = await fetchDigitalAsset(
      umi,
      fromWeb3JsPublicKey(new PublicKey(mint)),
    );
    const dataFromUrl = (await fetch(data.metadata.uri).then((res) =>
      res.json(),
    )) as { image: string };

    return { ...data, imageUrl: dataFromUrl.image };
  } catch (e) {
    return undefined;
  }
};
