import {
  type Connection,
  type Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  type Signer,
  SystemProgram,
  type TransactionInstruction,
} from "@solana/web3.js";
import {
  getStakePoolAccount,
  STAKE_POOL_PROGRAM_ID,
  StakePoolInstruction,
} from "@solana/spl-stake-pool";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import type BN from "bn.js";

function lamportsToSol(lamports: number | BN | bigint): number {
  if (typeof lamports === "number") {
    return Math.abs(lamports) / LAMPORTS_PER_SOL;
  }
  if (typeof lamports === "bigint") {
    return Math.abs(Number(lamports)) / LAMPORTS_PER_SOL;
  }

  let signMultiplier = 1;
  if (lamports.isNeg()) {
    signMultiplier = -1;
  }

  const absLamports = lamports.abs();
  const lamportsString = absLamports.toString(10).padStart(10, "0");
  const splitIndex = lamportsString.length - 9;
  const solString =
    lamportsString.slice(0, splitIndex) +
    "." +
    lamportsString.slice(splitIndex);
  return signMultiplier * parseFloat(solString);
}

async function findWithdrawAuthorityProgramAddress(
  programId: PublicKey,
  stakePoolAddress: PublicKey,
) {
  const [publicKey] = await PublicKey.findProgramAddress(
    [stakePoolAddress.toBuffer(), Buffer.from("withdraw")],
    programId,
  );
  return publicKey;
}

export async function depositSol(
  connection: Connection,
  stakePoolAddress: PublicKey,
  from: PublicKey,
  lamports: number,
  userSolTransfer: Keypair,
  destinationTokenAccount?: PublicKey,
  referrerTokenAccount?: PublicKey,
  depositAuthority?: PublicKey,
) {
  const fromBalance = await connection.getBalance(from, "confirmed");
  if (fromBalance < lamports) {
    throw new Error(
      `Not enough SOL to deposit into pool. Maximum deposit amount is ${lamportsToSol(
        fromBalance,
      )} SOL.`,
    );
  }

  const stakePoolAccount = await getStakePoolAccount(
    connection,
    stakePoolAddress,
  );
  const stakePool = stakePoolAccount.account.data;

  // Ephemeral SOL account just to do the transfer
  const signers: Signer[] = [userSolTransfer];
  const instructions: TransactionInstruction[] = [];

  // Create the ephemeral SOL account
  instructions.push(
    SystemProgram.transfer({
      fromPubkey: from,
      toPubkey: userSolTransfer.publicKey,
      lamports,
    }),
  );

  // Create token account if not specified
  if (!destinationTokenAccount) {
    const associatedAddress = getAssociatedTokenAddressSync(
      stakePool.poolMint,
      from,
    );
    instructions.push(
      createAssociatedTokenAccountIdempotentInstruction(
        from,
        associatedAddress,
        from,
        stakePool.poolMint,
      ),
    );
    destinationTokenAccount = associatedAddress;
  }

  const withdrawAuthority = await findWithdrawAuthorityProgramAddress(
    STAKE_POOL_PROGRAM_ID,
    stakePoolAddress,
  );

  instructions.push(
    StakePoolInstruction.depositSol({
      stakePool: stakePoolAddress,
      reserveStake: stakePool.reserveStake,
      fundingAccount: userSolTransfer.publicKey,
      destinationPoolAccount: destinationTokenAccount,
      managerFeeAccount: stakePool.managerFeeAccount,
      referralPoolAccount: referrerTokenAccount ?? destinationTokenAccount,
      poolMint: stakePool.poolMint,
      lamports,
      withdrawAuthority,
      depositAuthority,
    }),
  );

  return {
    instructions,
    signers,
  };
}
