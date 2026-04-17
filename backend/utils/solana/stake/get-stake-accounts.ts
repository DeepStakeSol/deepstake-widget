import { LAMPORTS_PER_SOL, STAKE_PROGRAM } from "@/utils/constants";
import { type Address, getBase64Encoder, type Rpc, type SolanaRpcApi } from "@solana/kit";
import { stakeAccountsFilter } from "./stake-filters";
import { stakeAccountCodec, type StakeAccountState } from "./struct";

const GET_STAKE_ACCOUNTS_CONFIG = {
  encoding: "base64",
  commitment: "processed"
} as const;

interface GetStakeAccountsInput {
  rpc: Rpc<SolanaRpcApi>;
  owner: Address;
  vote?: Address;
}

export interface GetStakeAccountResponse {
  address: Address;
  solBalance: number;
  owner: Address;
  state: StakeAccountState;
  activationEpoch: number;
  voter: Address;
  deactivationEpoch: number;
}

export async function getStakeAccounts({
  rpc,
  owner,
  vote
}: GetStakeAccountsInput): Promise<GetStakeAccountResponse[]> {
  const base64Encoder = getBase64Encoder();
  const stakeAccountsRaw = await rpc
    .getProgramAccounts(STAKE_PROGRAM.ADDRESS, {
      filters: stakeAccountsFilter({ owner, vote }),
      commitment: GET_STAKE_ACCOUNTS_CONFIG.commitment,
      encoding: GET_STAKE_ACCOUNTS_CONFIG.encoding
    })
    .send();
  return stakeAccountsRaw.map((account) => {
    const { data } = account.account;
    const bytes = base64Encoder.encode(data[0]);
    const address = account.pubkey;
    const solBalance = Number(account.account.lamports) / LAMPORTS_PER_SOL;
    const owner = account.account.owner;
    const parsed = stakeAccountCodec.decode(bytes);
    return {
      address,
      solBalance,
      owner,
      state: parsed.state,
      activationEpoch: Number(parsed.activationEpoch),
      voter: parsed.voter,
      deactivationEpoch: Number(parsed.deactivationEpoch),
    };
  });
}
