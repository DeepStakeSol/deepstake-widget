import { useCallback, useEffect, useRef, useState } from "react";
import { UiWalletAccount } from "@wallet-standard/react";
import { useWalletAccountTransactionSendingSigner } from "@solana/react";
import { StakeButtonBase } from "./StakeButtonBase";
import { useStakingModal } from "../../context/StakingModalContext";
import {
  getBase58Decoder,
  getTransactionDecoder,
} from "@solana/kit";
import { getCurrentChain } from "../../utils/config";
import { getRpcEndpoint } from "../../utils/solana/rpc";

import * as solanaWeb3 from '@solana/web3.js';
import * as solanaStakePool from '@solana/spl-stake-pool';

import type {
  Connection as ConnectionType,
  PublicKey as PublicKeyType,
  TransactionInstruction as TransactionInstructionType,
} from "@solana/web3.js";

interface StakeButtonProps {
  network: string;
  account: UiWalletAccount;
  stakeAmount: string;
  inSufficientBalance: boolean;
  onSuccess: () => void;
  onDataLoaded: (bSOLBalance: number) => void;
  onBSOLIsLoading: (isLoading: boolean) => void;
  voteIdentity?: string;
}

import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from "@solana/spl-token";
import { getBSOLMintAddress, getStakePoolAddress, getUpdatePoolURL } from "../../utils/solana/blaze";

import { confirmTransaction } from "../../utils/api";


// ===================
//  web3.js related
// ===================
const { Connection, Transaction, PublicKey, LAMPORTS_PER_SOL, TransactionInstruction } = solanaWeb3;
const { depositSol, stakePoolInfo } = solanaStakePool;

async function ensureAta(
  connection: ConnectionType,
  mint: PublicKeyType,
  owner: PublicKeyType
): Promise<{ ata: PublicKeyType; ix: TransactionInstructionType | null }> {
  const ata = await getAssociatedTokenAddress(mint, owner);

  try {
    await getAccount(connection, ata);
    return { ata, ix: null };           // already exists
  } catch (_) {
    const ix = createAssociatedTokenAccountInstruction(
      owner,     // payer
      ata,       // the ATA
      owner,     // owner of ATA
      mint
    );
    return { ata, ix };                 // needs to be created
  }
}

async function getBsolBalance(
  connection: ConnectionType,
  walletPubkey: PublicKeyType,
  bsolMint: PublicKeyType
): Promise<number> {
  const ata = await getAssociatedTokenAddress(
    bsolMint,
    walletPubkey
  );

  try {
    const account = await getAccount(connection, ata);

    // amount is bigint, decimals for bSOL = 9
    return Number(account.amount) / 1e9;
  } catch (_e) {
    // ATA doesn't exist → balance is zero
    return 0;
  }
}

const sleep = (ms: number) =>
  new Promise<void>(resolve => setTimeout(resolve, ms));


export function StakeButtonBlaze({
  network,
  account,
  stakeAmount,
  inSufficientBalance,
  onSuccess,
  onDataLoaded,
  onBSOLIsLoading,
  voteIdentity,
}: StakeButtonProps) {
  const { showSuccessModal, hideSuccessModal } = useStakingModal();
  const connection = new Connection(getRpcEndpoint(network));
  const currentChain = getCurrentChain();
  const transactionSendingSigner = useWalletAccountTransactionSendingSigner(
    account,
    currentChain
  );

  const wallet = new PublicKey(account.address);

  const [isSubmittingTransaction, setIsSubmittingTransaction] = useState(false);
  const [blazeSignature, setBlazeSignature] = useState<string | undefined>();
  const { current: NO_ERROR } = useRef(Symbol());
  const [currentError, setCurrentError] = useState(NO_ERROR);

  const BLAZESTAKE_POOL = new PublicKey(getStakePoolAddress(network));
  const BSOL_MINT = new PublicKey(getBSOLMintAddress(network));
  const UPDATE_POOL_URL = getUpdatePoolURL(network);

  const updatePool = () => {
    return new Promise<void>(async (_resolve, _reject) => {
        fetch(UPDATE_POOL_URL)
                .then((res) => res.json())
                .then(() => {})
                .catch((error) => console.error("Failed to fetch balance:", error));


        const info = await stakePoolInfo(connection, BLAZESTAKE_POOL);

        let solanaAmount = info.details.reserveStakeLamports;
        if (!solanaAmount) {
          return;
        }

        for(let i = 0; i < info.details.stakeAccounts.length; i++) {
            solanaAmount += parseInt(info.details.stakeAccounts[i].validatorLamports);
        }
    });
  }

    const handleBlazeSubmit = useCallback(
    async (evt: React.MouseEvent<HTMLButtonElement>) => {
      evt.preventDefault();
                  
      if (!stakeAmount || !transactionSendingSigner) return;

      setCurrentError(NO_ERROR);
      setIsSubmittingTransaction(true);
      setBlazeSignature(undefined);

      try {

        // Convert SOL to lamports
        const stakeLamportsAmount = Math.floor(
          parseFloat(stakeAmount) * LAMPORTS_PER_SOL
        );

            const info = await stakePoolInfo(connection, BLAZESTAKE_POOL);
            if(info.details.updateRequired) {
                await updatePool();
            }

            // 1. Ensure bSOL ATA exists for the user
            const { ata: bsolAta, ix: createAtaIx } =
              await ensureAta(connection, BSOL_MINT, wallet);

            const depositTx = await depositSol(
                connection,
                BLAZESTAKE_POOL,
                wallet,
                stakeLamportsAmount,
                undefined,
                bsolAta,
            );

            const transaction = new Transaction();

            const blockhash = (await connection.getLatestBlockhash('finalized')).blockhash;
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = wallet;

            // add create ATA instruction if needed
            if (createAtaIx) {
              transaction.add(createAtaIx);
            }

            transaction.add(...depositTx.instructions);

            // Add CLS memo instruction for validator-specific staking
            if (voteIdentity) {
              const memo = JSON.stringify({
                type: "cls/validator_stake/lamports",
                value: {
                  validator: voteIdentity
                }
              });

              const memoInstruction = new TransactionInstruction({
                keys: [{
                  pubkey: wallet,
                  isSigner: true,
                  isWritable: true
                }],
                programId: new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"),
                data: Buffer.from(new TextEncoder().encode(memo))
              });

              transaction.add(memoInstruction);
            }

            const signers = depositTx.signers;
            if(signers.length > 0) {
                transaction.partialSign(...signers);
            }

            // useWallet way
            const szTx = transaction.serialize({
              verifySignatures: false,
              requireAllSignatures: false,
            });

            const transactionDecoder = getTransactionDecoder();
            const decodedTransaction = transactionDecoder.decode(szTx);

            // leverages the wallet's transaction sending signer and rpc
            const rawSignature =
              await transactionSendingSigner.signAndSendTransactions([
                decodedTransaction
              ]);
            const signature = getBase58Decoder().decode(rawSignature[0]);


            // ===========================
            // === CONFIRM TRANSACTION ===
            // ===========================

            // Call the new confirmation API endpoint
            await confirmTransaction(network, {
              txid: signature,
              targetCommitment: "processed",
              timeout: 30000,
              interval: 1000,
            });

            // Notify BlazeStake CLS API for validator-specific staking
            if (voteIdentity) {
              try {
                const clsUrl = `https://stake.solblaze.org/api/v1/cls_stake?validator=${voteIdentity}&txid=${signature}`;
                await fetch(clsUrl);
              } catch (clsError) {
                console.error("Failed to register CLS stake:", clsError);
              }
            }

            setBlazeSignature(signature);

      } catch (error) {
        console.error("Staking error:", error);
        setCurrentError(error as symbol);
      } finally {
        setIsSubmittingTransaction(false);

            onBSOLIsLoading(true);
            await sleep(10000);
            const bSOLBalance = await getBsolBalance(
              connection,
              wallet,
              BSOL_MINT
            );
            onDataLoaded(bSOLBalance);
            onBSOLIsLoading(false);
      }
    },
    [account, transactionSendingSigner, NO_ERROR]
  );

  const handleBlazeCloseModal = useCallback(() => {
    setBlazeSignature(undefined);
    onSuccess();
  }, [onSuccess]);

  // Trigger success modal when transaction completes
  useEffect(() => {
    if (blazeSignature) {
      showSuccessModal({
        title: "Congratulations!",
        message: "Your Blaze Stake has been activated and has started to earn rewards!",
        signature: blazeSignature,
        onClose: () => {
          handleBlazeCloseModal();
        },
      });
    } else {
      hideSuccessModal();
    }
  }, [blazeSignature, showSuccessModal, hideSuccessModal, handleBlazeCloseModal]);

  const stakeAmountNumber = parseFloat(stakeAmount) || 0;
  const isZeroStake = stakeAmountNumber <= 0;
  const disableStakeButton = isSubmittingTransaction || inSufficientBalance || isZeroStake;
  const buttonLabel = isSubmittingTransaction
    ? "Confirming Transaction"
    : inSufficientBalance
      ? "Insufficient Balance"
      : isZeroStake
        ? "Enter stake amount"
        : "Stake";

  return (
    <StakeButtonBase
      buttonLabel={buttonLabel}
      disableStakeButton={disableStakeButton}
      isSendingTransaction={isSubmittingTransaction}
      handleSubmit={handleBlazeSubmit}
      error={currentError !== NO_ERROR ? currentError : undefined}
    />
  );
}
