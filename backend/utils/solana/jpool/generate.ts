import {
  address,
  appendTransactionMessageInstructions,
  assertIsTransactionMessageWithBlockhashLifetime,
  compileTransaction,
  createNoopSigner,
  createTransactionMessage,
  getAddressDecoder,
  getBase64EncodedWireTransaction,
  getBase64Encoder,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
  type Base64EncodedWireTransaction,
  type Blockhash,
  type IInstruction
} from "@solana/kit";
import {
  findAssociatedTokenPda,
  TOKEN_PROGRAM_ADDRESS
} from "@solana-program/token";
import {
  getSetComputeUnitLimitInstruction,
  getSetComputeUnitPriceInstruction
} from "@solana-program/compute-budget";

import { getPriorityFeeEstimate } from "@/utils/priorityFee";
import { createRpcConnection, getRpcEndpoint } from "@/utils/solana/rpc";
import {
  DEFAULT_PRIORITY_FEE_MICRO_LAMPORTS,
  VOTE_PROGRAM_ADDRESS
} from "@/utils/constants";
import { getJpoolStakePoolAddress, JSOL_MINT } from "@/utils/consts";
import {
  findStakePoolWithdrawAuthority,
  getCreateAssociatedTokenAccountIdempotentInstruction,
  getDepositSolInstruction,
  getPlainMemoInstruction
} from "@/utils/solana/blaze/stake-pool";
import {
  buildJpoolDirectStakeMemo,
  quoteDepositSol
} from "@/utils/solana/jpool/deposit";
import {
  JpoolRouteError,
  normalizeDepositSimulationError,
  type JpoolErrorCode
} from "@/utils/solana/jpool/errors";
import {
  decodeBase64AccountData,
  parseJpoolStakePool
} from "@/utils/solana/jpool/pool";

const COMPUTE_UNIT_MARGIN = 3_000;
const TOKEN_ACCOUNT_OWNER_OFFSET = 32;

interface JpoolMessageParams {
  wallet: Address;
  blockhashObject: Readonly<{
    blockhash: Blockhash;
    lastValidBlockHeight: bigint;
  }>;
  instructions: readonly IInstruction[];
  computeUnitLimit?: number;
  priorityFeeMicroLamports?: number;
}

// Envelope contract: SetComputeUnitLimit, SetComputeUnitPrice,
// [CreateIdempotent], DepositSol, Memo. The unsized sample omits compute
// budget instructions and is only used for simulation.
function getJpoolMessage({
  wallet,
  blockhashObject,
  instructions,
  computeUnitLimit,
  priorityFeeMicroLamports
}: JpoolMessageParams) {
  const budget: IInstruction[] =
    computeUnitLimit === undefined || priorityFeeMicroLamports === undefined
      ? []
      : [
          getSetComputeUnitLimitInstruction({ units: computeUnitLimit }),
          getSetComputeUnitPriceInstruction({
            microLamports: priorityFeeMicroLamports
          })
        ];
  return pipe(
    createTransactionMessage({ version: "legacy" }),
    (msg) => setTransactionMessageFeePayer(wallet, msg),
    (msg) => setTransactionMessageLifetimeUsingBlockhash(blockhashObject, msg),
    (msg) =>
      appendTransactionMessageInstructions([...budget, ...instructions], msg)
  );
}

const SIMULATION_ERROR_STATUS: Partial<Record<JpoolErrorCode, number>> = {
  JPOOL_POOL_UPDATING: 503,
  JPOOL_DEPOSITS_RESTRICTED: 503
};

async function readChainState<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch {
    throw new JpoolRouteError("JPOOL_RPC_UNAVAILABLE", 503);
  }
}

// Builds the unsigned JPool DepositSol transaction (with the direct-stake memo)
// used by /api/jpool/stake/generate and /api/selftest. The deposit is simulated
// once to size the compute budget. Throws JpoolRouteError.
export async function buildJpoolDepositTransaction({
  network,
  wallet,
  voteAccount,
  lamports
}: {
  network: string;
  wallet: Address;
  voteAccount: Address;
  lamports: bigint;
}): Promise<{
  transaction: Base64EncodedWireTransaction;
  expectedJsol: bigint;
}> {
  const poolAddressValue = getJpoolStakePoolAddress(network);
  if (!poolAddressValue) {
    throw new JpoolRouteError("JPOOL_MAINNET_ONLY", 400);
  }

  const rpcUrl = getRpcEndpoint(network);
  if (!rpcUrl) throw new JpoolRouteError("JPOOL_RPC_UNAVAILABLE", 503);

  const rpc = createRpcConnection(network);
  const poolAddress = address(poolAddressValue);
  const jsolMint = address(JSOL_MINT);
  const [jsolAta] = await findAssociatedTokenPda({
    owner: wallet,
    mint: jsolMint,
    tokenProgram: TOKEN_PROGRAM_ADDRESS
  });

  const [
    { value: poolAccount },
    { value: voteAccountInfo },
    { value: ataAccount },
    epochInfo,
    { value: latestBlockhash }
  ] = await readChainState(
    Promise.all([
      rpc
        .getAccountInfo(poolAddress, {
          commitment: "confirmed",
          encoding: "base64"
        })
        .send(),
      rpc
        .getAccountInfo(voteAccount, {
          commitment: "confirmed",
          encoding: "base64",
          dataSlice: { offset: 0, length: 0 }
        })
        .send(),
      rpc
        .getAccountInfo(jsolAta, {
          commitment: "confirmed",
          encoding: "base64",
          dataSlice: { offset: 0, length: 64 }
        })
        .send(),
      rpc.getEpochInfo({ commitment: "confirmed" }).send(),
      rpc.getLatestBlockhash({ commitment: "finalized" }).send()
    ])
  );

  if (!voteAccountInfo || voteAccountInfo.owner !== VOTE_PROGRAM_ADDRESS) {
    throw new JpoolRouteError("INVALID_VOTE_ACCOUNT", 400);
  }

  const pool = parseJpoolStakePool(poolAccount);
  if (pool.solDepositAuthority !== null) {
    throw new JpoolRouteError("JPOOL_DEPOSITS_RESTRICTED", 503);
  }
  if (pool.lastUpdateEpoch !== epochInfo.epoch) {
    // No public update trigger is known for JPool (unlike Blaze).
    throw new JpoolRouteError("JPOOL_POOL_UPDATING", 503);
  }

  const expectedJsol = quoteDepositSol({
    lamports,
    totalLamports: pool.totalLamports,
    poolTokenSupply: pool.poolTokenSupply,
    solDepositFee: pool.solDepositFee
  });
  if (expectedJsol === null) {
    throw new JpoolRouteError("JPOOL_DEPOSIT_TOO_SMALL", 400);
  }

  const walletSigner = createNoopSigner(wallet);
  const instructions: IInstruction[] = [];
  if (ataAccount) {
    const ataData = decodeBase64AccountData(ataAccount.data);
    const addressDecoder = getAddressDecoder();
    if (
      ataAccount.owner !== TOKEN_PROGRAM_ADDRESS ||
      ataData.length < 64 ||
      addressDecoder.decode(ataData.slice(0, 32)) !== jsolMint ||
      addressDecoder.decode(
        ataData.slice(
          TOKEN_ACCOUNT_OWNER_OFFSET,
          TOKEN_ACCOUNT_OWNER_OFFSET + 32
        )
      ) !== wallet
    ) {
      throw new JpoolRouteError("JPOOL_POOL_INVALID", 500, {
        reason: "Unexpected JSOL associated token account"
      });
    }
  } else {
    instructions.push(
      getCreateAssociatedTokenAccountIdempotentInstruction({
        payer: walletSigner,
        ata: jsolAta,
        owner: wallet,
        mint: jsolMint
      })
    );
  }

  const depositInstructionIndex = instructions.length;
  instructions.push(
    getDepositSolInstruction({
      stakePool: poolAddress,
      withdrawAuthority: await findStakePoolWithdrawAuthority(poolAddress),
      reserveStake: pool.reserveStake,
      // The wallet funds the deposit itself (one signer). JPool's indexer
      // attributes this shape: J1 mainnet gate, records 877 and 882.
      fundingAccount: walletSigner,
      destinationPoolAccount: jsolAta,
      managerFeeAccount: pool.managerFeeAccount,
      referralPoolAccount: jsolAta,
      poolMint: pool.poolMint,
      lamports
    }),
    getPlainMemoInstruction(buildJpoolDirectStakeMemo(voteAccount))
  );

  const sampleMessage = getJpoolMessage({
    wallet,
    blockhashObject: latestBlockhash,
    instructions
  });
  assertIsTransactionMessageWithBlockhashLifetime(sampleMessage);
  const sampleWireTransaction = getBase64EncodedWireTransaction(
    compileTransaction(sampleMessage)
  );

  const [simulation, priorityFeeMicroLamports] = await Promise.all([
    readChainState(
      rpc
        .simulateTransaction(sampleWireTransaction, {
          commitment: "confirmed",
          encoding: "base64",
          sigVerify: false
        })
        .send()
    ),
    getPriorityFeeEstimate(
      "Medium",
      { serialize: () => getBase64Encoder().encode(sampleWireTransaction) },
      rpcUrl
    )
      .then(({ priorityFeeEstimate }) =>
        Number.isFinite(priorityFeeEstimate) && priorityFeeEstimate >= 0
          ? Math.ceil(priorityFeeEstimate)
          : DEFAULT_PRIORITY_FEE_MICRO_LAMPORTS
      )
      .catch(() => DEFAULT_PRIORITY_FEE_MICRO_LAMPORTS)
  ]);

  if (simulation.value.err) {
    const code = normalizeDepositSimulationError(
      simulation.value.err,
      depositInstructionIndex
    );
    throw new JpoolRouteError(code, SIMULATION_ERROR_STATUS[code] ?? 400, {
      err: simulation.value.err
    });
  }
  const unitsConsumed = simulation.value.unitsConsumed;
  if (unitsConsumed === undefined || unitsConsumed === null) {
    throw new JpoolRouteError("JPOOL_SIMULATION_FAILED", 400);
  }

  const message = getJpoolMessage({
    wallet,
    blockhashObject: latestBlockhash,
    instructions,
    computeUnitLimit: Number(unitsConsumed) + COMPUTE_UNIT_MARGIN,
    priorityFeeMicroLamports
  });
  assertIsTransactionMessageWithBlockhashLifetime(message);

  return {
    transaction: getBase64EncodedWireTransaction(compileTransaction(message)),
    expectedJsol
  };
}
