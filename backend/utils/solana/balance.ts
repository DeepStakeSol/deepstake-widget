import {
  type Lamports,
  type Rpc
} from "@solana/kit";
import { type SolanaRpcApi } from "@solana/kit";
import { type Address } from "@solana/kit";

interface GetBalanceProps {
  rpc: Rpc<SolanaRpcApi>;
  address: Address;
}

export async function getBalance({
  rpc,
  address
}: GetBalanceProps): Promise<Lamports> {
  const { value } = await rpc.getBalance(address).send();
  return value;
}
