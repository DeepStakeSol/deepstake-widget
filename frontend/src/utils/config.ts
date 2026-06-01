import { Address, address } from "@solana/kit";
import { Options } from "../options";

export type NetworkConfig = {
  identifier: NetworkType;
  explorerCluster: string;
};

export type NetworkType = "mainnet" | "devnet";
export const VALID_NETWORKS: NetworkType[] = ["mainnet", "devnet"];
export interface Config {
  network: NetworkType;
  networks: Record<NetworkType, NetworkConfig>;
}

const networks: Record<NetworkType, NetworkConfig> = {
  mainnet: {
    identifier: "mainnet",
    explorerCluster: "mainnet-beta"
  },
  devnet: {
    identifier: "devnet",
    explorerCluster: "devnet"
  }
};

const DEFAULT_NETWORK: NetworkType = "devnet";
const warnedInvalidNetworks = new Set<string>();

function isValidNetwork(network: string): network is NetworkType {
  return VALID_NETWORKS.includes(network as NetworkType);
}

function normalizeNetwork(value: unknown): string | null {
  return typeof value === "string" ? value.toLowerCase() : null;
}

function warnInvalidNetwork(source: string, network: string) {
  const key = `${source}:${network}`;
  if (warnedInvalidNetworks.has(key)) return;
  warnedInvalidNetworks.add(key);
  console.warn(
    `Invalid ${source} network specified: ${network}. Falling back to the next configured network.`
  );
}

export function getConfiguredNetwork(options?: Options | null): NetworkType {
  const optionNetwork = normalizeNetwork(options?.network);
  if (optionNetwork) {
    if (isValidNetwork(optionNetwork)) return optionNetwork;
    warnInvalidNetwork("widget option", optionNetwork);
  }

  const envNetwork = normalizeNetwork(import.meta.env.VITE_NEXT_PUBLIC_NETWORK_ENV);
  if (envNetwork) {
    if (isValidNetwork(envNetwork)) return envNetwork;
    warnInvalidNetwork("environment", envNetwork);
  }

  return DEFAULT_NETWORK;
}

function getNetworkConfig(): NetworkConfig {
  const currentNetwork = getConfiguredNetwork();
  return networks[currentNetwork];
}

export function getValidatorAddress(options: Options | null): Address {
  const validatorAddress = options?.vote_account;
  
  if (!validatorAddress) {
    throw new Error("Vote Acc is not set");
  }
  return address(validatorAddress);
}

export function getCurrentChain(): `solana:${string}` {
  return `solana:${getNetworkConfig().identifier}`;
}

interface ExplorerTxUrlParams {
  signature: string;
  explorer: "solana-explorer" | "solscan" | "orbmarkets";
}
interface ExplorerAccountUrlParams {
  account: string;
  explorer: "solana-explorer" | "solscan" | "orbmarkets";
}

export function getExplorerTxUrl({
  signature,
  explorer
}: ExplorerTxUrlParams): string {
  const networkConfig = getNetworkConfig();
  let baseUrl: string;
  switch (explorer) {
    case "solana-explorer":
      baseUrl = "https://explorer.solana.com/tx/";
      break;
    case "solscan":
      baseUrl = "https://solscan.io/tx/";
      break;
    case "orbmarkets":
      baseUrl = "https://orbmarkets.io/tx/";
      break;
    default:
      throw new Error(`Invalid explorer specified: ${explorer}`);
  }

  const clusterExtension =
    networkConfig.identifier === "devnet" ? `?cluster=devnet` : "";

  return `${baseUrl}${signature}${clusterExtension}`;
}

export function getNetworkIdentifier(): NetworkType {
  return getNetworkConfig().identifier;
}

export function getExplorerAccountUrl({
  account,
  explorer
}: ExplorerAccountUrlParams): string {
  const networkConfig = getNetworkConfig();
  let baseUrl: string;
  switch (explorer) {
    case "solana-explorer":
      baseUrl = "https://explorer.solana.com/address/";
      break;
    case "solscan":
      baseUrl = "https://solscan.io/account/";
      break;
    case "orbmarkets":
      baseUrl = "https://orbmarkets.io/account/";
      break;
    default:
      throw new Error(`Invalid explorer specified: ${explorer}`);
  }

  const clusterExtension =
    networkConfig.identifier === "devnet" ? `?cluster=devnet` : "";

  return `${baseUrl}${account}${clusterExtension}`;
}
