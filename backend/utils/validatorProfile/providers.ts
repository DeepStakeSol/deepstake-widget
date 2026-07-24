import { getRpcEndpoint } from "@/utils/solana/rpc";

import type { ValidatorProfileCacheGroup } from "./cache";
import type {
  ProviderResult,
  ValidatorProfileProvider,
  ValidatorProfileProviderConfig,
} from "./types";

const STAKEWIZ_URL = "https://api.stakewiz.com/validator";
const TRILLIUM_URL = "https://api.trillium.so/validator_rewards";
const JITO_URL = "https://kobe.mainnet.jito.network/api/v1/validators";
const VALIDATORS_APP_URL = "https://www.validators.app/api/v1/validators";
const STAKEWIZ_TIMEOUT_MS = 8_000;
const ENHANCEMENT_TIMEOUT_MS = 8_000;
const VALIDATORS_APP_TIMEOUT_MS = 5_000;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function nullableNumber(
  value: unknown,
  minimum = 0,
  maximum = Number.POSITIVE_INFINITY
): number | null {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
    ? value
    : null;
}

function nullableBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function observedAt(value: unknown): string {
  const text = nullableString(value);
  if (text && !Number.isNaN(Date.parse(text))) return new Date(text).toISOString();
  return new Date().toISOString();
}

async function fetchJson(
  url: string,
  init: RequestInit,
  signal: AbortSignal
): Promise<unknown> {
  const response = await fetch(url, { ...init, signal });
  if (!response.ok) {
    throw new Error(`Provider request failed with HTTP ${response.status}`);
  }
  return await response.json();
}

function result(
  source: string,
  values: ProviderResult["values"],
  timestamp: unknown = null
): ProviderResult {
  return { source, values, observedAt: observedAt(timestamp) };
}

export const fetchStakewizProfile: ValidatorProfileProvider = async ({
  network,
  voteAccount,
  signal,
}) => {
  if (network !== "mainnet") return null;
  const data = asRecord(
    await fetchJson(`${STAKEWIZ_URL}/${voteAccount}`, {}, signal)
  );
  if (!data) throw new Error("Unexpected Stakewiz response format");

  const jitoCommissionBps = nullableNumber(data.jito_commission_bps, 0, 10_000);
  return result(
    "stakewiz",
    {
      name: nullableString(data.name),
      description: nullableString(data.description),
      logoUrl: nullableString(data.image),
      estimatedApyPercent: nullableNumber(data.total_apy, 0, 100),
      commissionPercent: nullableNumber(data.commission, 0, 100),
      mevCommissionPercent:
        jitoCommissionBps === null ? null : jitoCommissionBps / 100,
      mevEnabled: nullableBoolean(data.is_jito),
    },
    data.updated_at
  );
};

export const fetchTrilliumProfile: ValidatorProfileProvider = async ({
  network,
  voteAccount,
  signal,
}) => {
  if (network !== "mainnet") return null;
  const data = await fetchJson(`${TRILLIUM_URL}/${voteAccount}`, {}, signal);
  if (!Array.isArray(data)) throw new Error("Unexpected Trillium response format");

  const match = data
    .map(asRecord)
    .find((item) => item?.vote_account_pubkey === voteAccount);
  return match
    ? result("trillium", { logoUrl: nullableString(match.icon_url) })
    : null;
};

export const fetchJitoProfile: ValidatorProfileProvider = async ({
  network,
  voteAccount,
  signal,
}) => {
  if (network !== "mainnet") return null;

  const data = await fetchJson(`${JITO_URL}/${voteAccount}`, {}, signal);
  if (!Array.isArray(data)) throw new Error("Unexpected Jito response format");
  const latest = asRecord(data[0]);
  if (!latest) return result("jito", { mevEnabled: false });

  const commissionBps = nullableNumber(latest.mev_commission_bps, 0, 10_000);
  return result("jito", {
    mevEnabled: commissionBps !== null,
    mevCommissionPercent: commissionBps === null ? null : commissionBps / 100,
  });
};

export const fetchSolanaProfile: ValidatorProfileProvider = async ({
  network,
  voteAccount,
  signal,
}) => {
  const endpoint = getRpcEndpoint(network);
  if (!endpoint) throw new Error(`RPC endpoint is not configured for ${network}`);

  const data = asRecord(
    await fetchJson(
      endpoint,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getVoteAccounts",
          params: [{ votePubkey: voteAccount, keepUnstakedDelinquents: true }],
        }),
      },
      signal
    )
  );
  const rpcResult = asRecord(data?.result);
  if (!rpcResult) throw new Error("Unexpected Solana RPC response format");

  const accounts = [rpcResult.current, rpcResult.delinquent]
    .filter(Array.isArray)
    .flat() as unknown[];
  const account = accounts
    .map(asRecord)
    .find((item) => item?.votePubkey === voteAccount);
  if (!account) return null;

  return result("solana-rpc", {
    commissionPercent: nullableNumber(account.commission, 0, 100),
  });
};

export const fetchValidatorsAppProfile: ValidatorProfileProvider = async ({
  network,
  voteAccount,
  signal,
}) => {
  const token = process.env.VALIDATORS_APP_TOKEN;
  if (!token) return null;

  const data = await fetchJson(
    `${VALIDATORS_APP_URL}/${network}/${voteAccount}.json`,
    { headers: { Token: token } },
    signal
  );
  const entries = Array.isArray(data) ? data : [data];
  const match = entries
    .map(asRecord)
    .find(
      (item) =>
        item?.vote_account === voteAccount || item?.vote_identity === voteAccount
    );
  if (!match) return null;

  return result(
    "validators-app",
    {
      name: nullableString(match.name),
      description: nullableString(match.details),
      logoUrl: nullableString(match.avatar_url),
      commissionPercent: nullableNumber(match.commission, 0, 100),
    },
    match.updated_at
  );
};

export const validatorProfileProviders: ValidatorProfileProvider[] = [
  fetchStakewizProfile,
  fetchTrilliumProfile,
  fetchJitoProfile,
  fetchSolanaProfile,
  fetchValidatorsAppProfile,
];

export const validatorProfileProvidersByGroup: Record<
  ValidatorProfileCacheGroup,
  ValidatorProfileProvider[]
> = {
  identity: [fetchStakewizProfile, fetchValidatorsAppProfile],
  logo: [
    fetchTrilliumProfile,
    fetchStakewizProfile,
    fetchValidatorsAppProfile,
  ],
  commission: [
    fetchSolanaProfile,
    fetchStakewizProfile,
    fetchValidatorsAppProfile,
  ],
  apy: [fetchStakewizProfile],
  mev: [fetchJitoProfile, fetchStakewizProfile],
};

export const validatorProfileProviderConfigs: ValidatorProfileProviderConfig[] = [
  {
    id: "stakewiz",
    timeoutMs: STAKEWIZ_TIMEOUT_MS,
    provider: fetchStakewizProfile,
    baseline: true,
  },
  {
    id: "trillium",
    timeoutMs: ENHANCEMENT_TIMEOUT_MS,
    provider: fetchTrilliumProfile,
  },
  {
    id: "jito",
    timeoutMs: ENHANCEMENT_TIMEOUT_MS,
    provider: fetchJitoProfile,
  },
  {
    id: "solana-rpc",
    timeoutMs: ENHANCEMENT_TIMEOUT_MS,
    provider: fetchSolanaProfile,
  },
  {
    id: "validators-app",
    timeoutMs: VALIDATORS_APP_TIMEOUT_MS,
    provider: fetchValidatorsAppProfile,
  },
];

export const validatorProfileProviderConfigsByGroup: Record<
  ValidatorProfileCacheGroup,
  ValidatorProfileProviderConfig[]
> = Object.fromEntries(
  Object.entries(validatorProfileProvidersByGroup).map(([group, groupProviders]) => [
    group,
    groupProviders.map(
      (provider) =>
        validatorProfileProviderConfigs.find(
          (configuration) => configuration.provider === provider
        )!
    ),
  ])
) as Record<ValidatorProfileCacheGroup, ValidatorProfileProviderConfig[]>;
