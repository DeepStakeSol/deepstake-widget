import { createNoopSigner, address } from "@solana/kit";
import {
  findAssociatedTokenPda,
  TOKEN_PROGRAM_ADDRESS
} from "@solana-program/token";
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
import {
  findDirectorAddress,
  findDstInfoAddress,
  getInitDirectorInstruction,
  getMintDstInstruction,
  getSetStakeTargetInstruction
} from "../utils/solana/vault/instructions";

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
    const owner = address("11111111111111111111111111111111");
    const ownerSigner = createNoopSigner(owner);
    const target = address("Vote111111111111111111111111111111111111111");
    const mint = address("vSoLxydx6akxyMD9XEcPvGYNGq6Nn66oqVb3UkGkei7");
    const [sourceVsolAccount] = await findAssociatedTokenPda({
      owner,
      mint,
      tokenProgram: TOKEN_PROGRAM_ADDRESS
    });
    const director = await findDirectorAddress(owner);
    const directorInstructions = [
      getInitDirectorInstruction({ authority: ownerSigner, director }),
      getSetStakeTargetInstruction({
        authority: ownerSigner,
        director,
        stakeTarget: target
      })
    ];
    const dst = await findDstInfoAddress(mint);
    const mintInstruction = getMintDstInstruction({
      dst,
      vsolReserves: sourceVsolAccount,
      sourceVsolAccount,
      owner: ownerSigner,
      dstTokenAccount: sourceVsolAccount,
      tokenMint: mint,
      amount: BigInt(123_456_789)
    });

    const actual = {
      directorAddress: director,
      dst,
      sourceVsolAccount,
      director: directorInstructions.map(normalizeKitAsLegacyInstruction),
      mint: normalizeKitAsLegacyInstruction(mintInstruction)
    };
    expect(actual).toEqual(compatibility.vault);
  });
});
