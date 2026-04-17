import { NextResponse } from "next/server";









import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { getDirectInstruction } from '@/utils/getDirectInstruction';
import { getStakeInstruction } from "@/utils/stakeInstruction";
import BigNumber from "bignumber.js";
import { getPriorityFeeEstimate } from '@/utils/priorityFee';
import { getRpcEndpoint } from "@/utils/solana/rpc";



const VSOL_MINT = "vSoLxydx6akxyMD9XEcPvGYNGq6Nn66oqVb3UkGkei7";

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;

    const address = searchParams.get("address");
    if (!address) {
      return NextResponse.json(
        { error: "Missing required parameter: address" },
        { status: 400 }
      );
    }

    const mint = searchParams.get("mint");
    if (!mint) {
      return NextResponse.json(
        { error: "Missing required parameter: mint" },
        { status: 400 }
      );
    }

    const amount = searchParams.get("amount");
    if (!amount) {
      return NextResponse.json(
        { error: "Missing required parameter: amount" },
        { status: 400 }
      );
    }

    const balance = searchParams.get("balance");
    if (!balance) {
      return NextResponse.json(
        { error: "Missing required parameter: balance" },
        { status: 400 }
      );
    }

    const network = searchParams.get("network");
    
    //const rpcUrl = process.env.VITE_MAINNET_RPC_ENDPOINT;
    const rpcUrl = getRpcEndpoint(network);
    if (!rpcUrl) {
      throw new Error("RPC_URL is required");
    }

    const connection = new Connection(rpcUrl);
    

    const target = searchParams.get("target");
    const userSolTransfer = Keypair.generate();
    const ixs = [];
    if(target) {
    // create direct stake instruction
      if(mint !== VSOL_MINT) {
          return NextResponse.json(
            { error: "Must use vSOL mint for direct staking" },
            { status: 400 }
          );
      }
      ixs.push(...await getDirectInstruction(address, target, connection));
    }
    ixs.push(...await getStakeInstruction(
    new PublicKey(mint),
    new PublicKey(address),
    new BigNumber(amount),
    new BigNumber(balance),
    PublicKey.default,
    userSolTransfer,
    connection,
  ));
  const recentBlockhash = await connection.getLatestBlockhash();

   //Build a Tx to figure out CUs and priority fee
  const testMessage = new TransactionMessage({
    recentBlockhash: recentBlockhash.blockhash,
    instructions: ixs,
    payerKey: new PublicKey(address),
  }).compileToV0Message();
  const testTx = new VersionedTransaction(testMessage);
  //const {priorityFeeEstimate: microLamports } = await getPriorityFeeEstimate("Medium", testTx, heliusUrl);
  const {priorityFeeEstimate: microLamports } = await getPriorityFeeEstimate("Medium", testTx, rpcUrl);
  const sim = await connection.simulateTransaction(testTx);
  const units = sim.value.unitsConsumed + 3000;
  ixs.unshift(ComputeBudgetProgram.setComputeUnitPrice({
    microLamports
  }));
  ixs.unshift(ComputeBudgetProgram.setComputeUnitLimit({
    units
  }));

  //Build the final Tx
  const message = new TransactionMessage({
    recentBlockhash: recentBlockhash.blockhash,
    instructions: ixs,
    payerKey: new PublicKey(address),
  }).compileToV0Message();
  const tx = new VersionedTransaction(message);
  tx.sign([userSolTransfer]);

  return NextResponse.json({
    transaction: Buffer.from(tx.serialize()).toString("base64"),
  });
}
