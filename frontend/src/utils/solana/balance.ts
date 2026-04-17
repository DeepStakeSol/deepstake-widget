import { Lamports, Rpc } from "@solana/kit";
import { SolanaRpcApi } from "@solana/kit";
import { Address } from "@solana/kit";
import { getRpcEndpoint } from "./rpc";
import { createSolanaRpc } from "@solana/kit";

const LAMPORTS_PER_SOL = 1e9;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;
const RPC_TIMEOUT_MS = 10000; // 10 seconds timeout per RPC call

interface GetBalanceProps {
  rpc: Rpc<SolanaRpcApi>;
  address: Address;
}

/**
 * Wraps a promise with a timeout
 */
function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs)
    ),
  ]);
}

export async function getBalance({
  rpc,
  address
}: GetBalanceProps): Promise<Lamports> {
  const balancePromise = rpc.getBalance(address).send();
  const { value } = await withTimeout(
    balancePromise,
    RPC_TIMEOUT_MS,
    `RPC call timed out after ${RPC_TIMEOUT_MS}ms`
  );
  return value;
}

export interface NetworkBalanceInfo {
  network: string;
  balance: Lamports;
  balanceInSOL: number;
}

/**
 * Fetches balance with retry logic and timeout (non-blocking)
 */
async function fetchBalanceWithRetry(
  rpc: Rpc<SolanaRpcApi>,
  address: Address,
  maxRetries: number = MAX_RETRIES
): Promise<bigint | null> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const balance = await getBalance({ rpc, address });
      return BigInt(balance.toString());
    } catch (error) {
      // Check if error is a timeout error
      const isTimeoutError = error instanceof Error && 
        (error.name === 'AbortError' || error.message.includes('timed out'));
      
      if (isTimeoutError) {
        console.warn(`RPC call timed out (attempt ${attempt + 1}/${maxRetries + 1})`);
      }
      
      if (attempt < maxRetries) {
        // Wait before retry (exponential backoff)
        await new Promise(resolve =>
          setTimeout(resolve, Math.pow(2, attempt) * RETRY_DELAY_MS)
        );
      }
    }
  }
  return null;
}

/**
 * Checks wallet balance across all networks and returns info if balance exists on a non-current network.
 * Retries and timeouts are handled silently in the background.
 * @param walletAddress - The wallet address to check
 * @param currentNetwork - The currently selected network in the app
 * @returns NetworkBalanceInfo if balance > 0 on a different network, null otherwise
 */
export async function checkOtherNetworkBalances(
  walletAddress: string,
  currentNetwork: string
): Promise<NetworkBalanceInfo | null> {
  const networks = ["mainnet", "devnet", "testnet"];

  for (const network of networks) {
    // Skip the current network
    if (network === currentNetwork) {
      continue;
    }

    try {
      const endpoint = getRpcEndpoint(network);
      if (!endpoint) {
        console.warn(`No RPC endpoint configured for ${network}`);
        continue;
      }

      const rpc = createSolanaRpc(endpoint);
      const balance = await fetchBalanceWithRetry(rpc, walletAddress as Address);

      if (balance !== null && balance > 0n) {
        return {
          network,
          balance: balance as unknown as Lamports,
          balanceInSOL: Number(balance) / LAMPORTS_PER_SOL
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Failed to fetch balance for ${network}:`, errorMessage);
      // Continue checking other networks
    }
  }

  return null;
}
