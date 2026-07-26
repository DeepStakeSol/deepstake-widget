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
import {
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
  TOKEN_PROGRAM_ADDRESS
} from "@solana-program/token";

const SYSTEM_PROGRAM_ADDRESS = address("11111111111111111111111111111111");
export const STAKE_POOL_PROGRAM_ADDRESS = address(
  "SPoo1Ku8WFXoNDMHPsrGSTSG1Y47rzgn41SLUNakuHy"
);
export const MEMO_PROGRAM_ADDRESS = address(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
);

const STAKE_POOL_ACCOUNT_TYPE_OFFSET = 0;
const STAKE_POOL_RESERVE_STAKE_OFFSET = 130;
const STAKE_POOL_MINT_OFFSET = 162;
const STAKE_POOL_MANAGER_FEE_OFFSET = 194;
const STAKE_POOL_TOKEN_PROGRAM_OFFSET = 226;
const STAKE_POOL_LAST_UPDATE_EPOCH_OFFSET = 274;
const DEPOSIT_SOL_DISCRIMINATOR = 14;

type BlazeInstruction = IInstruction &
  IInstructionWithAccounts<
    readonly (IAccountMeta<string> | IAccountSignerMeta<string>)[]
  > &
  IInstructionWithData<Uint8Array>;

export interface BlazeStakePoolAccount {
  reserveStake: Address;
  poolMint: Address;
  managerFeeAccount: Address;
  tokenProgram: Address;
  lastUpdateEpoch: bigint;
}

function decodeAddress(bytes: Uint8Array, offset: number): Address {
  return getAddressDecoder().decode(bytes.slice(offset, offset + 32));
}

export function decodeBlazeStakePoolAccount(
  bytes: Uint8Array
): BlazeStakePoolAccount {
  if (bytes.length < STAKE_POOL_LAST_UPDATE_EPOCH_OFFSET + 8) {
    throw new Error("Invalid stake pool account data");
  }
  if (bytes[STAKE_POOL_ACCOUNT_TYPE_OFFSET] !== 1) {
    throw new Error("Invalid stake pool account type");
  }

  return {
    reserveStake: decodeAddress(bytes, STAKE_POOL_RESERVE_STAKE_OFFSET),
    poolMint: decodeAddress(bytes, STAKE_POOL_MINT_OFFSET),
    managerFeeAccount: decodeAddress(bytes, STAKE_POOL_MANAGER_FEE_OFFSET),
    tokenProgram: decodeAddress(bytes, STAKE_POOL_TOKEN_PROGRAM_OFFSET),
    lastUpdateEpoch: new DataView(
      bytes.buffer,
      bytes.byteOffset + STAKE_POOL_LAST_UPDATE_EPOCH_OFFSET,
      8
    ).getBigUint64(0, true)
  };
}

export async function findStakePoolWithdrawAuthority(
  stakePool: Address
): Promise<Address> {
  const [withdrawAuthority] = await getProgramDerivedAddress({
    programAddress: STAKE_POOL_PROGRAM_ADDRESS,
    seeds: [getAddressEncoder().encode(stakePool), "withdraw"]
  });
  return withdrawAuthority;
}

export function getCreateAssociatedTokenAccountInstruction({
  payer,
  ata,
  owner,
  mint
}: {
  payer: TransactionSigner;
  ata: Address;
  owner: Address;
  mint: Address;
}): BlazeInstruction {
  return {
    programAddress: ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
    accounts: [
      {
        address: payer.address,
        role: AccountRole.WRITABLE_SIGNER,
        signer: payer
      },
      { address: ata, role: AccountRole.WRITABLE },
      { address: owner, role: AccountRole.READONLY },
      { address: mint, role: AccountRole.READONLY },
      { address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.READONLY },
      { address: TOKEN_PROGRAM_ADDRESS, role: AccountRole.READONLY }
    ],
    // Preserve the empty payload emitted by the legacy SPL Token helper.
    data: new Uint8Array()
  } as BlazeInstruction;
}

export function getDepositSolInstruction({
  stakePool,
  withdrawAuthority,
  reserveStake,
  fundingAccount,
  destinationPoolAccount,
  managerFeeAccount,
  referralPoolAccount,
  poolMint,
  lamports
}: {
  stakePool: Address;
  withdrawAuthority: Address;
  reserveStake: Address;
  fundingAccount: TransactionSigner;
  destinationPoolAccount: Address;
  managerFeeAccount: Address;
  referralPoolAccount: Address;
  poolMint: Address;
  lamports: bigint;
}): BlazeInstruction {
  const data = new Uint8Array(9);
  data[0] = DEPOSIT_SOL_DISCRIMINATOR;
  new DataView(data.buffer).setBigUint64(1, lamports, true);

  return {
    programAddress: STAKE_POOL_PROGRAM_ADDRESS,
    accounts: [
      { address: stakePool, role: AccountRole.WRITABLE },
      { address: withdrawAuthority, role: AccountRole.READONLY },
      { address: reserveStake, role: AccountRole.WRITABLE },
      {
        address: fundingAccount.address,
        role: AccountRole.WRITABLE_SIGNER,
        signer: fundingAccount
      },
      { address: destinationPoolAccount, role: AccountRole.WRITABLE },
      { address: managerFeeAccount, role: AccountRole.WRITABLE },
      { address: referralPoolAccount, role: AccountRole.WRITABLE },
      { address: poolMint, role: AccountRole.WRITABLE },
      { address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.READONLY },
      { address: TOKEN_PROGRAM_ADDRESS, role: AccountRole.READONLY }
    ],
    data
  } as BlazeInstruction;
}

export function getBlazeMemoInstruction({
  wallet,
  validator
}: {
  wallet: TransactionSigner;
  validator: string;
}): BlazeInstruction {
  return {
    programAddress: MEMO_PROGRAM_ADDRESS,
    accounts: [
      {
        address: wallet.address,
        role: AccountRole.WRITABLE_SIGNER,
        signer: wallet
      }
    ],
    data: new TextEncoder().encode(
      JSON.stringify({
        type: "cls/validator_stake/lamports",
        value: { validator }
      })
    )
  } as unknown as BlazeInstruction;
}
