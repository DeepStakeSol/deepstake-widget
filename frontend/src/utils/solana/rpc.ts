import { createSolanaRpc, SolanaRpcApi, type Rpc } from "@solana/kit";
import { ValidatorStakingError } from "../errors";

export function createRpcConnection(network: string): Rpc<SolanaRpcApi> {
  const endpoint = getRpcEndpoint(network);
  const currentNetwork = network || "devnet";
  const endpointName = currentNetwork.toUpperCase() + "_RPC_ENDPOINT";
  if (!endpoint) {
    throw new ValidatorStakingError(
      `${endpointName} environment variable not set`,
      "RPC_ENDPOINT_MISSING"
    );
  }
  try {
    return createSolanaRpc(endpoint);
  } catch (error) {
    throw new ValidatorStakingError(
      "Failed to create Solana RPC connection",
      "RPC_CONNECTION_FAILED",
      { originalError: error instanceof Error ? error.message : String(error) }
    );
  }
}

export function getRpcEndpoint(network: string): string {
  const currentNetwork = network;

  switch (currentNetwork) {
    case "mainnet":
      return import.meta.env.VITE_MAINNET_RPC_ENDPOINT || "";
    case "devnet":
      return import.meta.env.VITE_DEVNET_RPC_ENDPOINT || "";
    case "testnet":
      return import.meta.env.VITE_TESTNET_RPC_ENDPOINT || "";
    default:
      throw new ValidatorStakingError(
        "Invalid network environment variable",
        "INVALID_NETWORK_ENV"
      );
  }
}
