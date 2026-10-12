import { getAddressDecoder } from "@solana/kit";

import { getRpcEndpoint } from "@/utils/solana/rpc";

import type { ValidatorProfileCacheGroup } from "./cache";
import type {
  ProviderContext,
  ProviderResult,
  ValidatorProfileProvider,
  ValidatorProfileProviderConfig,
} from "./types";

const STAKEWIZ_URL = "https://api.stakewiz.com/validator";
const JITO_URL = "https://kobe.mainnet.jito.network/api/v1/validators";
const VALIDATORS_APP_URL = "https://www.validators.app/api/v1/validators";
const STAKEWIZ_TIMEOUT_MS = 8_000;
const ENHANCEMENT_TIMEOUT_MS = 8_000;
const VALIDATORS_APP_TIMEOUT_MS = 5_000;

// On-chain validator-info, as written by `solana validator-info publish`: a
// Config program account whose keys are the Va1idator1nfo marker and the
// validator identity (signer), followed by a bincode String of JSON.
const CONFIG_PROGRAM_ID = "Config1111111111111111111111111111111111111";
const VALIDATOR_INFO_MARKER = "Va1idator1nfo111111111111111111111111111111";
const VALIDATOR_INFO_KEY_COUNT = 2;
const VALIDATOR_INFO_MARKER_OFFSET = 1;
const VALIDATOR_INFO_IDENTITY_OFFSET = 34;
const VALIDATOR_INFO_IDENTITY_SIGNER_OFFSET = 66;
const VALIDATOR_INFO_STRING_OFFSET = 67;
const VALIDATOR_INFO_MAX_JSON_BYTES = 4_096;

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

async function rpcCall(
  network: ProviderContext["network"],
  method: string,
  params: unknown[],
  signal: AbortSignal
): Promise<unknown> {
  const endpoint = getRpcEndpoint(network);
  if (!endpoint) throw new Error(`RPC endpoint is not configured for ${network}`);

  const data = asRecord(
    await fetchJson(
      endpoint,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      },
      signal
    )
  );
  if (!data || !("result" in data)) {
    throw new Error("Unexpected Solana RPC response format");
  }
  return data.result;
}

async function fetchVoteAccount(
  network: ProviderContext["network"],
  voteAccount: string,
  signal: AbortSignal
): Promise<Record<string, unknown> | null> {
  const rpcResult = asRecord(
    await rpcCall(
      network,
      "getVoteAccounts",
      [{ votePubkey: voteAccount, keepUnstakedDelinquents: true }],
      signal
    )
  );
  if (!rpcResult) throw new Error("Unexpected Solana RPC response format");

  const accounts = [rpcResult.current, rpcResult.delinquent]
    .filter(Array.isArray)
    .flat() as unknown[];
  return (
    accounts.map(asRecord).find((item) => item?.votePubkey === voteAccount) ??
    null
  );
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
  const account = await fetchVoteAccount(network, voteAccount, signal);
  if (!account) return null;

  return result("solana-rpc", {
    commissionPercent: nullableNumber(account.commission, 0, 100),
  });
};

export interface ValidatorInfo {
  name: string | null;
  details: string | null;
  website: string | null;
  iconUrl: string | null;
}

function httpsUrl(value: unknown): string | null {
  const text = nullableString(value);
  if (!text) return null;
  try {
    return new URL(text).protocol === "https:" ? text : null;
  } catch {
    return null;
  }
}

// Parses one validator-info Config account. Returns null for anything that is
// not a signed validator-info record for `identity` (when given).
export function parseValidatorInfoAccount(
  data: Uint8Array,
  identity?: string
): ValidatorInfo | null {
  if (data.length < VALIDATOR_INFO_STRING_OFFSET + 8) return null;
  if (data[0] !== VALIDATOR_INFO_KEY_COUNT) return null;

  const addresses = getAddressDecoder();
  const marker = addresses.decode(
    data.subarray(VALIDATOR_INFO_MARKER_OFFSET, VALIDATOR_INFO_MARKER_OFFSET + 32)
  );
  const key = addresses.decode(
    data.subarray(
      VALIDATOR_INFO_IDENTITY_OFFSET,
      VALIDATOR_INFO_IDENTITY_OFFSET + 32
    )
  );
  if (marker !== VALIDATOR_INFO_MARKER) return null;
  if (data[VALIDATOR_INFO_IDENTITY_SIGNER_OFFSET] !== 1) return null;
  if (identity !== undefined && key !== identity) return null;

  const length = new DataView(
    data.buffer,
    data.byteOffset + VALIDATOR_INFO_STRING_OFFSET,
    8
  ).getBigUint64(0, true);
  const start = VALIDATOR_INFO_STRING_OFFSET + 8;
  if (
    length > BigInt(VALIDATOR_INFO_MAX_JSON_BYTES) ||
    start + Number(length) > data.length
  ) {
    return null;
  }

  let info: Record<string, unknown> | null;
  try {
    info = asRecord(
      JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(
          data.subarray(start, start + Number(length))
        )
      )
    );
  } catch {
    return null;
  }
  if (!info) return null;

  return {
    name: nullableString(info.name),
    details: nullableString(info.details),
    website: httpsUrl(info.website),
    iconUrl: httpsUrl(info.iconUrl),
  };
}

// The same data as `solana validator-info get`, for one validator. Works on
// every cluster, so it is the only identity/logo source on devnet and the last
// fallback on mainnet.
export const fetchSolanaValidatorInfoProfile: ValidatorProfileProvider = async ({
  network,
  voteAccount,
  signal,
}) => {
  const account = await fetchVoteAccount(network, voteAccount, signal);
  const identity = nullableString(account?.nodePubkey);
  if (!identity) return null;

  const matches = await rpcCall(
    network,
    "getProgramAccounts",
    [
      CONFIG_PROGRAM_ID,
      {
        encoding: "base64",
        filters: [
          {
            memcmp: {
              offset: VALIDATOR_INFO_MARKER_OFFSET,
              bytes: VALIDATOR_INFO_MARKER,
            },
          },
          {
            memcmp: { offset: VALIDATOR_INFO_IDENTITY_OFFSET, bytes: identity },
          },
        ],
      },
    ],
    signal
  );
  if (!Array.isArray(matches)) {
    throw new Error("Unexpected Solana RPC response format");
  }

  for (const match of matches) {
    const encoded = asRecord(asRecord(match)?.account)?.data;
    if (!Array.isArray(encoded) || typeof encoded[0] !== "string") continue;
    const info = parseValidatorInfoAccount(
      Buffer.from(encoded[0], "base64"),
      identity
    );
    if (!info) continue;
    return result("solana-validator-info", {
      name: info.name,
      description: info.details,
      logoUrl: info.iconUrl,
    });
  }
  return null;
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
  fetchJitoProfile,
  fetchSolanaProfile,
  fetchValidatorsAppProfile,
  fetchSolanaValidatorInfoProfile,
];

export const validatorProfileProvidersByGroup: Record<
  ValidatorProfileCacheGroup,
  ValidatorProfileProvider[]
> = {
  identity: [
    fetchStakewizProfile,
    fetchValidatorsAppProfile,
    fetchSolanaValidatorInfoProfile,
  ],
  logo: [
    fetchStakewizProfile,
    fetchValidatorsAppProfile,
    fetchSolanaValidatorInfoProfile,
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
  {
    id: "solana-validator-info",
    timeoutMs: ENHANCEMENT_TIMEOUT_MS,
    provider: fetchSolanaValidatorInfoProfile,
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
