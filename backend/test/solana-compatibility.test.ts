import { createNoopSigner, address } from "@solana/kit";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  findAssociatedTokenPda,
  TOKEN_PROGRAM_ADDRESS
} from "@solana-program/token";
import { PublicKey, type TransactionInstruction } from "@solana/web3.js";
import { BN, Program } from "@coral-xyz/anchor";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  getDeactivateInstruction,
  getDelegateStakeInstruction,
  getInitializeInstruction,
  getWithdrawInstruction
} from "@solana-program/stake";
import compatibility from "./fixtures/solana-compatibility.json";
import {
  findStakePoolWithdrawAuthority,
  getCreateAssociatedTokenAccountInstruction,
  getDepositSolInstruction
} from "../utils/solana/blaze/stake-pool";

const SYSTEM_ADDRESS = address("11111111111111111111111111111111");
const STAKE_ADDRESS = address("Stake11111111111111111111111111111111111111");
const VOTE_ADDRESS = address("Vote111111111111111111111111111111111111111");
const CLOCK_ADDRESS = address("SysvarC1ock11111111111111111111111111111111");
const RENT_ADDRESS = address("SysvarRent111111111111111111111111111111111");
const STAKE_HISTORY_ADDRESS = address(
  "SysvarStakeHistory1111111111111111111111111"
);
const STAKE_CONFIG_ADDRESS = address(
  "StakeConfig11111111111111111111111111111111"
);
const directedStakeIdl = JSON.parse(
  readFileSync(
    path.join(
      process.cwd(),
      "node_modules/@thevault/directed-stake/src/idlRaw.json"
    ),
    "utf8"
  )
);
const dstIdl = JSON.parse(
  readFileSync(
    path.join(process.cwd(), "node_modules/@thevault/dst/src/idlRaw.json"),
    "utf8"
  )
);

function normalizeKitInstruction(instruction: {
  programAddress: string;
  accounts?: readonly ({ address: string; role: number } | undefined)[];
  data?: Uint8Array;
}) {
  return {
    programAddress: instruction.programAddress,
    accounts: (instruction.accounts ?? []).filter(Boolean).map((account) => ({
      address: account!.address,
      role: account!.role
    })),
    dataHex: Buffer.from(instruction.data ?? []).toString("hex")
  };
}

function normalizeLegacyInstruction(instruction: TransactionInstruction) {
  return {
    programAddress: instruction.programId.toBase58(),
    accounts: instruction.keys.map((account) => ({
      address: account.pubkey.toBase58(),
      isSigner: account.isSigner,
      isWritable: account.isWritable
    })),
    dataHex: instruction.data.toString("hex")
  };
}

function normalizeKitAsLegacyInstruction(instruction: {
  programAddress: string;
  accounts?: readonly ({ address: string; role: number } | undefined)[];
  data?: Uint8Array;
}) {
  return {
    programAddress: instruction.programAddress,
    accounts: (instruction.accounts ?? []).filter(Boolean).map((account) => ({
      address: account!.address,
      isSigner: account!.role >= 2,
      isWritable: account!.role === 1 || account!.role === 3
    })),
    dataHex: Buffer.from(instruction.data ?? []).toString("hex")
  };
}

describe("Solana SDK migration compatibility", () => {
  it("locks native stake instruction ABIs", () => {
    const authoritySigner = createNoopSigner(SYSTEM_ADDRESS);
    const stakeSigner = createNoopSigner(STAKE_ADDRESS);

    const actual = {
      initialize: normalizeKitInstruction(
        getInitializeInstruction({
          stake: STAKE_ADDRESS,
          rentSysvar: RENT_ADDRESS,
          arg0: {
            staker: SYSTEM_ADDRESS,
            withdrawer: SYSTEM_ADDRESS
          },
          arg1: {
            unixTimestamp: 0n,
            epoch: 0n,
            custodian: SYSTEM_ADDRESS
          }
        })
      ),
      delegate: normalizeKitInstruction(
        getDelegateStakeInstruction({
          stake: STAKE_ADDRESS,
          vote: VOTE_ADDRESS,
          clockSysvar: CLOCK_ADDRESS,
          stakeHistory: STAKE_HISTORY_ADDRESS,
          unused: STAKE_CONFIG_ADDRESS,
          stakeAuthority: authoritySigner
        })
      ),
      deactivate: normalizeKitInstruction(
        getDeactivateInstruction({
          stake: STAKE_ADDRESS,
          clockSysvar: CLOCK_ADDRESS,
          stakeAuthority: authoritySigner
        })
      ),
      withdraw: normalizeKitInstruction(
        getWithdrawInstruction({
          stake: STAKE_ADDRESS,
          recipient: SYSTEM_ADDRESS,
          clockSysvar: CLOCK_ADDRESS,
          stakeHistory: STAKE_HISTORY_ADDRESS,
          withdrawAuthority: authoritySigner,
          args: 123_456_789n
        })
      ),
      signerRoles: {
        authority: authoritySigner.address,
        stake: stakeSigner.address
      }
    };

    expect(actual).toEqual(compatibility.native);
  });

  it("locks Blaze ATA, PDA, and deposit instruction ABIs", async () => {
    const wallet = address("11111111111111111111111111111111");
    const walletSigner = createNoopSigner(wallet);
    const mint = address("bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1");
    const stakePool = address("stk9ApL5HeVAwPLr3TLhDXdZS8ptVu7zp6ov8HFDuMi");
    const reserveStake = address("Stake11111111111111111111111111111111111111");
    const managerFee = address("Vote111111111111111111111111111111111111111");
    const [destination] = await findAssociatedTokenPda({
      owner: wallet,
      mint,
      tokenProgram: TOKEN_PROGRAM_ADDRESS
    });
    const withdrawAuthority = await findStakePoolWithdrawAuthority(stakePool);

    const createAta = getCreateAssociatedTokenAccountInstruction({
      payer: walletSigner,
      ata: destination,
      owner: wallet,
      mint
    });
    const deposit = getDepositSolInstruction({
      stakePool,
      withdrawAuthority,
      reserveStake,
      fundingAccount: walletSigner,
      destinationPoolAccount: destination,
      managerFeeAccount: managerFee,
      referralPoolAccount: destination,
      poolMint: mint,
      lamports: BigInt(123_456_789)
    });

    const actual = {
      destination,
      withdrawAuthority,
      createAta: normalizeKitAsLegacyInstruction(createAta),
      deposit: normalizeKitAsLegacyInstruction(deposit)
    };
    expect(actual).toEqual(compatibility.blaze);
  });

  it("locks Vault director and DST mint instruction ABIs", async () => {
    const owner = new PublicKey("11111111111111111111111111111111");
    const target = new PublicKey("Vote111111111111111111111111111111111111111");
    const mint = new PublicKey("vSoLxydx6akxyMD9XEcPvGYNGq6Nn66oqVb3UkGkei7");
    const sourceVsolAccount = getAssociatedTokenAddressSync(mint, owner, true);
    const provider = { connection: {}, wallet: { publicKey: owner } } as never;
    const directedProgram = new Program(directedStakeIdl, provider);
    const [director] = PublicKey.findProgramAddressSync(
      [Buffer.from("director"), owner.toBuffer()],
      new PublicKey(directedStakeIdl.address)
    );
    const directorInstructions = [
      await directedProgram.methods
        .initDirector()
        .accounts({ authority: owner, payer: owner })
        .instruction(),
      await directedProgram.methods
        .setStakeTarget()
        .accounts({ authority: owner, stakeTarget: target })
        .instruction()
    ];

    const [dst] = PublicKey.findProgramAddressSync(
      [Buffer.from("dst"), mint.toBuffer()],
      new PublicKey(dstIdl.address)
    );
    const dstProgram = new Program(dstIdl, provider);
    const mintInstruction = await dstProgram.methods
      .mintDst(new BN(123_456_789))
      .accountsStrict({
        dst,
        vsolReserves: sourceVsolAccount,
        sourceVsolAccount,
        owner,
        dstTokenAccount: sourceVsolAccount,
        tokenMint: mint,
        tokenProgram: new PublicKey(
          "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        )
      })
      .instruction();

    const actual = {
      directorAddress: director.toBase58(),
      dst: dst.toBase58(),
      sourceVsolAccount: sourceVsolAccount.toBase58(),
      director: directorInstructions.map(normalizeLegacyInstruction),
      mint: normalizeLegacyInstruction(mintInstruction)
    };
    expect(actual).toEqual(compatibility.vault);
  });
});
