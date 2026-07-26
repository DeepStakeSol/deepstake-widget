import {
  AccountRole,
  address,
  getAddressDecoder,
  getAddressEncoder,
  getProgramDerivedAddress,
  type Address,
  type IAccountMeta,
  type IAccountSignerMeta,
  type IInstruction,
  type IInstructionWithAccounts,
  type IInstructionWithData,
  type TransactionSigner
} from "@solana/kit";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";

const SYSTEM_PROGRAM_ADDRESS = address("11111111111111111111111111111111");
const CLOCK_SYSVAR_ADDRESS = address(
  "SysvarC1ock11111111111111111111111111111111"
);
export const DIRECTED_STAKE_PROGRAM_ADDRESS = address(
  "DStkUE3DjxBhVwEGNzv89eni1p7LpYuHSxxm1foggbEv"
);
export const DST_PROGRAM_ADDRESS = address(
  "VtokuDkNTQxXPJAp37ZXsoS4myJpxjHZ5RmCbDhUED4"
);

const INIT_DIRECTOR_DISCRIMINATOR = new Uint8Array([
  187, 176, 215, 229, 47, 249, 190, 199
]);
const SET_STAKE_TARGET_DISCRIMINATOR = new Uint8Array([
  82, 172, 106, 255, 106, 24, 153, 243
]);
const MINT_DST_DISCRIMINATOR = new Uint8Array([
  219, 110, 216, 13, 99, 204, 214, 228
]);
const DST_TOKEN_MINT_OFFSET = 8;
const DST_VSOL_RESERVES_OFFSET = 104;

type VaultInstruction = IInstruction &
  IInstructionWithAccounts<
    readonly (IAccountMeta<string> | IAccountSignerMeta<string>)[]
  > &
  IInstructionWithData<Uint8Array>;

export interface DstInfoAccount {
  tokenMint: Address;
  vsolReserves: Address;
}

function decodeAddress(bytes: Uint8Array, offset: number): Address {
  return getAddressDecoder().decode(bytes.slice(offset, offset + 32));
}

export function decodeDirectorStakeTarget(bytes: Uint8Array): Address {
  if (bytes.length < 40) {
    throw new Error("Invalid director account data");
  }
  return decodeAddress(bytes, 8);
}

export function decodeDstInfoAccount(bytes: Uint8Array): DstInfoAccount {
  if (bytes.length < DST_VSOL_RESERVES_OFFSET + 32) {
    throw new Error("Invalid DST account data");
  }
  return {
    tokenMint: decodeAddress(bytes, DST_TOKEN_MINT_OFFSET),
    vsolReserves: decodeAddress(bytes, DST_VSOL_RESERVES_OFFSET)
  };
}

export async function findDirectorAddress(owner: Address): Promise<Address> {
  const [director] = await getProgramDerivedAddress({
    programAddress: DIRECTED_STAKE_PROGRAM_ADDRESS,
    seeds: ["director", getAddressEncoder().encode(owner)]
  });
  return director;
}

export async function findDstInfoAddress(mint: Address): Promise<Address> {
  const [dst] = await getProgramDerivedAddress({
    programAddress: DST_PROGRAM_ADDRESS,
    seeds: ["dst", getAddressEncoder().encode(mint)]
  });
  return dst;
}

export function getInitDirectorInstruction({
  authority,
  director
}: {
  authority: TransactionSigner;
  director: Address;
}): VaultInstruction {
  return {
    programAddress: DIRECTED_STAKE_PROGRAM_ADDRESS,
    accounts: [
      {
        address: authority.address,
        role: AccountRole.READONLY_SIGNER,
        signer: authority
      },
      { address: director, role: AccountRole.WRITABLE },
      {
        address: authority.address,
        role: AccountRole.WRITABLE_SIGNER,
        signer: authority
      },
      { address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.READONLY }
    ],
    data: INIT_DIRECTOR_DISCRIMINATOR
  } as VaultInstruction;
}

export function getSetStakeTargetInstruction({
  authority,
  director,
  stakeTarget
}: {
  authority: TransactionSigner;
  director: Address;
  stakeTarget: Address;
}): VaultInstruction {
  return {
    programAddress: DIRECTED_STAKE_PROGRAM_ADDRESS,
    accounts: [
      {
        address: authority.address,
        role: AccountRole.READONLY_SIGNER,
        signer: authority
      },
      { address: director, role: AccountRole.WRITABLE },
      { address: stakeTarget, role: AccountRole.READONLY },
      { address: CLOCK_SYSVAR_ADDRESS, role: AccountRole.READONLY }
    ],
    data: SET_STAKE_TARGET_DISCRIMINATOR
  } as VaultInstruction;
}

export function getMintDstInstruction({
  dst,
  vsolReserves,
  sourceVsolAccount,
  owner,
  dstTokenAccount,
  tokenMint,
  amount
}: {
  dst: Address;
  vsolReserves: Address;
  sourceVsolAccount: Address;
  owner: TransactionSigner;
  dstTokenAccount: Address;
  tokenMint: Address;
  amount: bigint;
}): VaultInstruction {
  const data = new Uint8Array(16);
  data.set(MINT_DST_DISCRIMINATOR);
  new DataView(data.buffer).setBigUint64(8, amount, true);

  return {
    programAddress: DST_PROGRAM_ADDRESS,
    accounts: [
      { address: dst, role: AccountRole.WRITABLE },
      { address: vsolReserves, role: AccountRole.WRITABLE },
      { address: sourceVsolAccount, role: AccountRole.WRITABLE },
      {
        address: owner.address,
        role: AccountRole.READONLY_SIGNER,
        signer: owner
      },
      { address: dstTokenAccount, role: AccountRole.WRITABLE },
      { address: tokenMint, role: AccountRole.WRITABLE },
      { address: TOKEN_PROGRAM_ADDRESS, role: AccountRole.READONLY }
    ],
    data
  } as VaultInstruction;
}
