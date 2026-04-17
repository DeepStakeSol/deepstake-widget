import {
  getStructEncoder,
  getU32Encoder,
  getU64Encoder,
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

    console.log("expectAddress: ", address);

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

const WITHDRAW_DISCRIMINATOR = 4;

export type WithdrawInstruction<
  TProgram extends string = typeof STAKE_PROGRAM_ADDRESS,
  TAccountStake extends string | IAccountMeta<string> = string,
  TAccountRecipient extends string | IAccountMeta<string> = string,
  TAccountClockSysvar extends
    | string
    | IAccountMeta<string> = 'SysvarC1ock11111111111111111111111111111111',
  TAccountStakeHistory extends string | IAccountMeta<string> = string,
  TAccountWithdrawAuthority extends string | IAccountMeta<string> = string,
  TAccountLockupAuthority extends
    | string
    | IAccountMeta<string>
    | undefined = undefined,
  TRemainingAccounts extends readonly IAccountMeta<string>[] = [],
> = IInstruction<TProgram> &
  IInstructionWithData<Uint8Array> &
  IInstructionWithAccounts<
    [
      TAccountStake extends string
        ? WritableAccount<TAccountStake>
        : TAccountStake,
      TAccountRecipient extends string
        ? WritableAccount<TAccountRecipient>
        : TAccountRecipient,
      TAccountClockSysvar extends string
        ? ReadonlyAccount<TAccountClockSysvar>
        : TAccountClockSysvar,
      TAccountStakeHistory extends string
        ? ReadonlyAccount<TAccountStakeHistory>
        : TAccountStakeHistory,
      TAccountWithdrawAuthority extends string
        ? ReadonlySignerAccount<TAccountWithdrawAuthority> &
            IAccountSignerMeta<TAccountWithdrawAuthority>
        : TAccountWithdrawAuthority,
      ...(TAccountLockupAuthority extends undefined
        ? []
        : [
            TAccountLockupAuthority extends string
              ? ReadonlySignerAccount<TAccountLockupAuthority> &
                  IAccountSignerMeta<TAccountLockupAuthority>
              : TAccountLockupAuthority,
          ]),
      ...TRemainingAccounts,
    ]
  >;

type WithdrawInstructionDataArgs = { args: number | bigint };

export function getWithdrawInstructionDataEncoder(): Encoder<WithdrawInstructionDataArgs> {
  return transformEncoder(
    getStructEncoder([
      ['discriminator', getU32Encoder()],
      ['args', getU64Encoder()],
    ]),
    (value) => ({ ...value, discriminator: WITHDRAW_DISCRIMINATOR })
  );
}

export type WithdrawInput<
  TAccountStake extends string = string,
  TAccountRecipient extends string = string,
  TAccountClockSysvar extends string = string,
  TAccountStakeHistory extends string = string,
  TAccountWithdrawAuthority extends string = string,
  TAccountLockupAuthority extends string = string,
> = {
  /** Stake account from which to withdraw */
  stake: Address<TAccountStake>;
  /** Recipient account */
  recipient: Address<TAccountRecipient>;
  /** Clock sysvar */
  clockSysvar?: Address<TAccountClockSysvar>;
  /** Stake history sysvar */
  stakeHistory: Address<TAccountStakeHistory>;
  /** Withdraw authority */
  withdrawAuthority: TransactionSigner<TAccountWithdrawAuthority>;
  /** Lockup authority */
  lockupAuthority?: TransactionSigner<TAccountLockupAuthority>;
  args: WithdrawInstructionDataArgs['args'];
};

export function getWithdrawInstruction<
  TAccountStake extends string,
  TAccountRecipient extends string,
  TAccountClockSysvar extends string,
  TAccountStakeHistory extends string,
  TAccountWithdrawAuthority extends string,
  TAccountLockupAuthority extends string,
  TProgramAddress extends Address = typeof STAKE_PROGRAM_ADDRESS,
>(
  input: WithdrawInput<
    TAccountStake,
    TAccountRecipient,
    TAccountClockSysvar,
    TAccountStakeHistory,
    TAccountWithdrawAuthority,
    TAccountLockupAuthority
  >,
  config?: { programAddress?: TProgramAddress }
): WithdrawInstruction<
  TProgramAddress,
  TAccountStake,
  TAccountRecipient,
  TAccountClockSysvar,
  TAccountStakeHistory,
  TAccountWithdrawAuthority,
  TAccountLockupAuthority
> {
  // Program address.
  const programAddress = config?.programAddress ?? STAKE_PROGRAM_ADDRESS;

  // Original accounts.
  const originalAccounts = {
    stake: { value: input.stake ?? null, isWritable: true },
    recipient: { value: input.recipient ?? null, isWritable: true },
    clockSysvar: { value: input.clockSysvar ?? null, isWritable: false },
    stakeHistory: { value: input.stakeHistory ?? null, isWritable: false },
    withdrawAuthority: {
      value: input.withdrawAuthority ?? null,
      isWritable: false,
    },
    lockupAuthority: {
      value: input.lockupAuthority ?? null,
      isWritable: false,
    },
  };
  const accounts = originalAccounts as Record<
    keyof typeof originalAccounts,
    ResolvedAccount
  >;

  // Original args.
  const args = { ...input };

  // Resolve default values.
  if (!accounts.clockSysvar.value) {
    accounts.clockSysvar.value =
      'SysvarC1ock11111111111111111111111111111111' as Address<'SysvarC1ock11111111111111111111111111111111'>;
  }

  const getAccountMeta = getAccountMetaFactory(programAddress, 'omitted');

  const instruction = {
    accounts: [
      getAccountMeta(accounts.stake),
      getAccountMeta(accounts.recipient),
      getAccountMeta(accounts.clockSysvar),
      getAccountMeta(accounts.stakeHistory),
      getAccountMeta(accounts.withdrawAuthority),
    ],
    programAddress,
    data: getWithdrawInstructionDataEncoder().encode(
      args as WithdrawInstructionDataArgs
    ),
  } as WithdrawInstruction<
    TProgramAddress,
    TAccountStake,
    TAccountRecipient,
    TAccountClockSysvar,
    TAccountStakeHistory,
    TAccountWithdrawAuthority,
    TAccountLockupAuthority
  >;

  return instruction;
}
