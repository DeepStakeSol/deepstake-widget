import {
  getStructEncoder,
  getU32Encoder,
  transformEncoder,
  upgradeRoleToSigner,
  type ReadonlySignerAccount,
  AccountRole,
  type Address,
  type Encoder,
  type IAccountMeta,
  type IInstruction,
  type IInstructionWithAccounts,
  type IInstructionWithData,
  type ReadonlyAccount,
  type WritableAccount,
  type IAccountSignerMeta,
  type ProgramDerivedAddress,
  type TransactionSigner
} from "@solana/kit";
import {
  STAKE_PROGRAM_ADDRESS,
} from "@solana-program/stake";

function getAccountMetaFactory(
  programAddress: Address,
  optionalAccountStrategy: "omitted" | "programId"
) {
  return (
    account: ResolvedAccount
  ): IAccountMeta | IAccountSignerMeta | undefined => {
    if (!account.value) {
      if (optionalAccountStrategy === "omitted") return;
      return Object.freeze({
        address: programAddress,
        role: AccountRole.READONLY
      });
    }

    const writableRole = account.isWritable
      ? AccountRole.WRITABLE
      : AccountRole.READONLY;
    const address = expectAddress(account.value);
    return Object.freeze({
      address,
      role:
        typeof account.value === "object" && "address" in account.value
          ? upgradeRoleToSigner(writableRole)
          : writableRole,
      ...(typeof account.value === "object" && "address" in account.value
        ? { signer: account.value }
        : {})
    });
  };
}
type ResolvedAccount<
  T extends string = string,
  U extends
    | Address<T>
    | ProgramDerivedAddress<T>
    | TransactionSigner<T>
    | null = Address<T> | ProgramDerivedAddress<T> | TransactionSigner<T> | null
> = {
  isWritable: boolean;
  value: U;
};
function expectAddress<T extends string = string>(
  value:
    | Address<T>
    | ProgramDerivedAddress<T>
    | TransactionSigner<T>
    | null
    | undefined
): Address<T> {
  if (!value) {
    throw new Error("Expected a Address.");
  }
  if (typeof value === "object" && "address" in value) {
    return value.address;
  }
  if (Array.isArray(value)) {
    return value[0];
  }
  return value as Address<T>;
}

const UNSTAKE_DISCRIMINATOR = 5;

type UnstakeInstruction<
  TProgram extends string = typeof STAKE_PROGRAM_ADDRESS,
  TAccountStake extends string | IAccountMeta<string> = string,
  TAccountClockSysvar extends
    | string
    | IAccountMeta<string> = "SysvarC1ock11111111111111111111111111111111",
  TAccountStakeAuthority extends string | IAccountMeta<string> = string,
  TRemainingAccounts extends readonly IAccountMeta<string>[] = []
> = IInstruction<TProgram> &
  IInstructionWithData<Uint8Array> &
  IInstructionWithAccounts<
    [
      TAccountStake extends string
        ? WritableAccount<TAccountStake>
        : TAccountStake,
      TAccountClockSysvar extends string
        ? ReadonlyAccount<TAccountClockSysvar>
        : TAccountClockSysvar,
      TAccountStakeAuthority extends string
        ? ReadonlySignerAccount<TAccountStakeAuthority> &
            IAccountSignerMeta<TAccountStakeAuthority>
        : TAccountStakeAuthority,
      ...TRemainingAccounts
    ]
  >;

type UnstakeInstructionDataArgs = {};

function getUnstakeInstructionDataEncoder(): Encoder<UnstakeInstructionDataArgs> {
  return transformEncoder(
    getStructEncoder([["discriminator", getU32Encoder()]]),
    (value) => ({ ...value, discriminator: UNSTAKE_DISCRIMINATOR })
  );
}

type UnstakeInput<
  TAccountStake extends string = string,
  TAccountClockSysvar extends string = string,
  TAccountStakeAuthority extends string = string
> = {
  /** Initialized stake account to be deactivated */
  stake: Address<TAccountStake>;
  /** Clock sysvar */
  clockSysvar?: Address<TAccountClockSysvar>;
  /** Stake authority */
  stakeAuthority: TransactionSigner<TAccountStakeAuthority>;
};

export function getUnstakeInstruction<
  TAccountStake extends string,
  TAccountClockSysvar extends string,
  TAccountStakeAuthority extends string,
  TProgramAddress extends Address = typeof STAKE_PROGRAM_ADDRESS
>(
  input: UnstakeInput<
    TAccountStake,
    TAccountClockSysvar,
    TAccountStakeAuthority
  >,
  config?: { programAddress?: TProgramAddress }
): UnstakeInstruction<
  TProgramAddress,
  TAccountStake,
  TAccountClockSysvar,
  TAccountStakeAuthority
> {
  // Program address.
  const programAddress = config?.programAddress ?? STAKE_PROGRAM_ADDRESS;

  // Original accounts.
  const originalAccounts = {
    stake: { value: input.stake ?? null, isWritable: true },
    clockSysvar: { value: input.clockSysvar ?? null, isWritable: false },
    stakeAuthority: { value: input.stakeAuthority ?? null, isWritable: false }
  };
  const accounts = originalAccounts as Record<
    keyof typeof originalAccounts,
    ResolvedAccount
  >;

  // Resolve default values.
  if (!accounts.clockSysvar.value) {
    accounts.clockSysvar.value =
      "SysvarC1ock11111111111111111111111111111111" as Address<"SysvarC1ock11111111111111111111111111111111">;
  }

  const getAccountMeta = getAccountMetaFactory(programAddress, "programId");
  const instruction = {
    accounts: [
      getAccountMeta(accounts.stake),
      getAccountMeta(accounts.clockSysvar),
      getAccountMeta(accounts.stakeAuthority)
    ],
    programAddress,
    data: getUnstakeInstructionDataEncoder().encode({})
  } as UnstakeInstruction<
    TProgramAddress,
    TAccountStake,
    TAccountClockSysvar,
    TAccountStakeAuthority
  >;

  return instruction;
}
