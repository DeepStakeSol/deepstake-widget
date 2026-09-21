import { type GetProgramAccountsDatasizeFilter } from "@solana/kit";
import { type GetProgramAccountsMemcmpFilter } from "@solana/kit";
import { type Address, type Base58EncodedBytes } from "@solana/kit";
import { STAKE_PROGRAM } from "../../constants";

type GetProgramAccountsFilter =
  | GetProgramAccountsDatasizeFilter
  | GetProgramAccountsMemcmpFilter;
type GetProgramAccountsFilters = Array<GetProgramAccountsFilter>;

interface StakeAccountsFilterInput {
  owner: Address;
  vote?: Address;
}

// An Address is already a validated base58 string; the RPC filter uses a
// separate nominal brand for the same wire value.
function addressAsBase58Bytes(value: Address): Base58EncodedBytes {
  return value as string as Base58EncodedBytes;
}

export const stakeAccountsFilter = ({
  owner,
  vote
}: StakeAccountsFilterInput): GetProgramAccountsFilters => {
  const filters = [
    {
      memcmp: {
        offset: BigInt(STAKE_PROGRAM.STAKE_ACCOUNT_FILTERS.ownerOffset),
        encoding: "base58" as const,
        bytes: addressAsBase58Bytes(owner)
      }
    },
    {
      dataSize: BigInt(STAKE_PROGRAM.STAKE_ACCOUNT_FILTERS.sizeOf)
    }
  ];

  if (vote) {
    filters.push({
      memcmp: {
        offset: BigInt(STAKE_PROGRAM.STAKE_ACCOUNT_FILTERS.voteOffset),
        encoding: "base58" as const,
        bytes: addressAsBase58Bytes(vote)
      }
    });
  }

  return filters;
};
