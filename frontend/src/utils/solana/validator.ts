import { getValidatorAddress } from "../../utils/config";

const API_BASR_URL = import.meta.env.VITE_BACKEND_URL;
const VALIDATOR_INFO_URL = "https://api.stakewiz.com/validator";
const BACKEND_TRILLIUM_REWARDS_URL = `${API_BASR_URL}/api/trillium/rewards`;

export interface ValidatorIdentity {
  rank: number;
  identity: string;
  vote_identity: string;

  name: string;
  keybase: string;
  description: string;
  website: string;
  image: string;

  updated_at: string;
}

export interface ValidatorNetworkInfo {
  ip_latitude: string;
  ip_longitude: string;
  ip_city: string;
  ip_country: string;
  ip_asn: string;
  ip_org: string;

  asn: string;

  tpu_ip: string;
}

export interface ValidatorStakeInfo {
  activated_stake: number;
  stake_weight: number;
  stake_ratio: number;

  first_epoch_with_stake: number;
  first_epoch_distance: number;

  epoch: number;
  epoch_slot_height: number;
}

export interface ValidatorVotingInfo {
  last_vote: number;
  root_slot: number;

  credits: number;
  epoch_credits: number;
  credit_ratio: number;

  vote_success: number;
  skip_rate: number;
  wiz_skip_rate: number;

  delinquent: boolean;
  no_voting_override: boolean;
  skip_rate_ignored: boolean;
}

export interface ValidatorRewardsInfo {
  commission: number;
  jito_commission_bps: number;

  apy_estimate: number;
  staking_apy: number;
  jito_apy: number;
  total_apy: number;

  is_jito: boolean;
}

export interface ValidatorScoreInfo {
  wiz_score: number;
  score_version: number;

  vote_success_score: number;
  skip_rate_score: number;
  info_score: number;
  commission_score: number;
  epoch_distance_score: number;
  stake_weight_score: number;
  withdraw_authority_score: number;
  uptime_score: number;

  asn_concentration: number;
  asn_concentration_score: number;

  city_concentration: number;
  city_concentration_score: number;

  asncity_concentration: number;
  asncity_concentration_score: number;

  tpu_ip_concentration: number;
  tpu_ip_concentration_score: number;

  invalid_version_score: number;
  superminority_penalty: number;
}

export interface ValidatorSoftwareInfo {
  version: string;
  version_valid: boolean;

  mod: boolean;
  above_halt_line: boolean;

  uptime: number;

  admin_comment: string | null;
}

export interface ValidatorInfoResponse
  extends ValidatorIdentity,
    ValidatorNetworkInfo,
    ValidatorStakeInfo,
    ValidatorVotingInfo,
    ValidatorRewardsInfo,
    ValidatorScoreInfo,
    ValidatorSoftwareInfo {}

interface TrilliumRewardItem {
  identity_pubkey: string;
  icon_url: string;
  [key: string]: unknown;
}

export const fetchValidatorInfo = async (): Promise<ValidatorInfoResponse> => {
  try {
    const identity = getValidatorAddress();
    const url = new URL(`${VALIDATOR_INFO_URL}/${identity}`);

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error fetching validator info:", error);
    throw error;
  }
};

export const fetchValidatorLogo = async (): Promise<string | null> => {
  const validatorIdentity = getValidatorAddress();

  try {
    const url = new URL(BACKEND_TRILLIUM_REWARDS_URL, window.location.origin);
    url.searchParams.append("validatorIdentity", validatorIdentity);

    const response = await fetch(url);

    if (!response.ok) {
      console.warn(`Failed to fetch validator logo: HTTP ${response.status}`);
      return null;
    }

    const data: TrilliumRewardItem[] = await response.json();

    if (!Array.isArray(data)) {
      return null;
    }

    const matchingItem = data.find(
      (item) => item.vote_account_pubkey === validatorIdentity
    );

    return matchingItem?.icon_url || null;
  } catch (error) {
    console.error("Error fetching validator logo:", error);
    return null;
  }
};
