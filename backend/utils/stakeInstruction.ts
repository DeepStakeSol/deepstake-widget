import {
  type Connection,
  Keypair,
  PublicKey,
  type TransactionInstruction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import BigNumber from "bignumber.js";
import { getStakePoolInfo } from "./stakePool";
import { findDSTInfoAddress, mintDST } from "@thevault/dst";
import { STAKE_POOL_ADDRESS, VSOL_MINT } from "./consts";
import { SignerWallet } from "@saberhq/solana-contrib";
import { AnchorProvider } from "@coral-xyz/anchor";
import { depositSol } from "./depositSol";

export async function getStakeInstruction(
  mint: PublicKey,
  payer: PublicKey,
  balance: BigNumber,
  enteredAmount: BigNumber,
  vsolReserves: PublicKey,
  userSolTransfer: Keypair,
  connection: Connection,
) {
  let instructions: TransactionInstruction[] = [];

  const vsolAta = getAssociatedTokenAddressSync(
    new PublicKey(VSOL_MINT),
    payer,
    true,
  );
  const userVsolAtaAccount = await connection.getAccountInfo(vsolAta);
  if (!userVsolAtaAccount) {
    instructions.push(
      createAssociatedTokenAccountInstruction(
        payer,
        vsolAta,
        payer,
        new PublicKey(VSOL_MINT),
      ),
    );
  }

  const stakePoolSummary = await getStakePoolInfo(connection);
  const amount = BigNumber.minimum(balance, enteredAmount);
  const provider = new AnchorProvider(
    connection,
    new SignerWallet(Keypair.generate()),
  );
  const dstAddress = findDSTInfoAddress(new PublicKey(mint));

  const depositSolIx = await depositSol(
    connection,
    new PublicKey(STAKE_POOL_ADDRESS),
    payer,
    amount.toNumber(),
    userSolTransfer,
    vsolAta
  );
  for (const ix of depositSolIx.instructions) {
    instructions.push(ix);
  }
  const outputAmount = amount
    .times(stakePoolSummary.totalSupply)
    .div(stakePoolSummary.totalSOL);

  if(mint.toBase58() !== VSOL_MINT)  {
    // Create LST ATA if needed
    const lstAta = getAssociatedTokenAddressSync(mint, payer, true);
    const userAtaAccount = await connection.getAccountInfo(lstAta);
    if (!userAtaAccount) {
      instructions.push(
          createAssociatedTokenAccountInstruction(payer, lstAta, payer, mint),
      );
    }
    const mintTX = mintDST({
      provider: { ...provider, connection },
      dst: dstAddress,
      dstTokenAccount: lstAta,
      mintAmount: Number(outputAmount),
      sourceVsolAccount: vsolAta,
      owner: payer,
    });
    const mintIx = await mintTX.instruction();
    instructions.push(mintIx);
  }
  return instructions;
}
