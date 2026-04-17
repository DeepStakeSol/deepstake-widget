import { ValidatorStakingError } from "../errors";

export function getStakePoolAddress(network: string): string {
   switch (network) {
    case "mainnet":
      return import.meta.env.VITE_MAINNET_BLAZESTAKE_POOL_ADDR || "";
    case "devnet":
      return import.meta.env.VITE_DEVNET_BLAZESTAKE_POOL_ADDR || "";
    case "testnet":
      return import.meta.env.VITE_TESTNET_BLAZESTAKE_POOL_ADDR || "";
    default:
      throw new ValidatorStakingError(
        "Invalid network environment variable",
        "INVALID_NETWORK_ENV"
      );
  }
}

export function getBSOLMintAddress(network: string): string {
   switch (network) {
    case "mainnet":
      return import.meta.env.VITE_MAINNET_BSOL_MINT_ADDR || "";
    case "devnet":
      return import.meta.env.VITE_DEVNET_BSOL_MINT_ADDR || "";
    case "testnet":
      return import.meta.env.VITE_TESTNET_BSOL_MINT_ADDR || "";
    default:
      throw new ValidatorStakingError(
        "Invalid network environment variable",
        "INVALID_NETWORK_ENV"
      );
  }
}

export function getUpdatePoolURL(network: string): string {
   switch (network) {
    case "mainnet":
      return import.meta.env.VITE_MAINNET_UPDATE_POOL_URL || "";
    case "devnet":
      return import.meta.env.VITE_DEVNET_UPDATE_POOL_URL || "";
    case "testnet":
      return import.meta.env.VITE_TESTNET_UPDATE_POOL_URL || "";
    default:
      throw new ValidatorStakingError(
        "Invalid network environment variable",
        "INVALID_NETWORK_ENV"
      );
  }
}

export function getValidatorCountURL(network: string): string {
   switch (network) {
    case "mainnet":
      return import.meta.env.VITE_MAINNET_VALIDATOR_COUNT_URL || "";
    case "devnet":
      return import.meta.env.VITE_DEVNET_VALIDATOR_COUNT_URL || "";
    case "testnet":
      return import.meta.env.VITE_TESTNET_VALIDATOR_COUNT_URL || "";
    default:
      throw new ValidatorStakingError(
        "Invalid network environment variable",
        "INVALID_NETWORK_ENV"
      );
  }
}
