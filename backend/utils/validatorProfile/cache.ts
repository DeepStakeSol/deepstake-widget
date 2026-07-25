import { randomUUID } from "node:crypto";

import { getRedisClient, isRedisConfigured } from "../redis";

import type {
  FieldMetadata,
  ValidatorNetwork,
  ValidatorProfileField,
  ValidatorProfileValues
} from "./types";

export const VALIDATOR_PROFILE_CACHE_GROUPS = [
  "identity",
  "logo",
  "commission",
  "apy",
  "mev"
] as const;

export type ValidatorProfileCacheGroup =
  (typeof VALIDATOR_PROFILE_CACHE_GROUPS)[number];

export const CACHE_GROUP_FIELDS: Record<
  ValidatorProfileCacheGroup,
  ValidatorProfileField[]
> = {
  identity: ["name", "description"],
  logo: ["logoUrl"],
  commission: ["commissionPercent"],
  apy: ["estimatedApyPercent"],
  mev: ["mevCommissionPercent", "mevEnabled"]
};

export const CACHE_POLICIES: Record<
  ValidatorProfileCacheGroup,
  { freshMs: number; staleMs: number }
> = {
  identity: {
    freshMs: 24 * 60 * 60 * 1_000,
    staleMs: 30 * 24 * 60 * 60 * 1_000
  },
  logo: {
    freshMs: 24 * 60 * 60 * 1_000,
    staleMs: 30 * 24 * 60 * 60 * 1_000
  },
  commission: { freshMs: 60 * 1_000, staleMs: 15 * 60 * 1_000 },
  apy: { freshMs: 15 * 60 * 1_000, staleMs: 24 * 60 * 60 * 1_000 },
  // Solana epochs are approximately two days; this remains configurable in a later phase.
  mev: { freshMs: 5 * 60 * 1_000, staleMs: 48 * 60 * 60 * 1_000 }
};

export interface CachedField {
  value: ValidatorProfileValues[ValidatorProfileField];
  source: string;
  observedAt: string;
  cachedAt: number;
}

export interface CachedProfileGroup {
  version: 1;
  refreshedAt: number;
  records: Partial<Record<ValidatorProfileField, CachedField>>;
}

export type CachedProfileGroups = Partial<
  Record<ValidatorProfileCacheGroup, CachedProfileGroup>
>;

export interface ValidatorProfileCache {
  read(
    network: ValidatorNetwork,
    voteAccount: string
  ): Promise<CachedProfileGroups>;
  write(
    network: ValidatorNetwork,
    voteAccount: string,
    group: ValidatorProfileCacheGroup,
    value: CachedProfileGroup
  ): Promise<void>;
  acquireLock(
    network: ValidatorNetwork,
    voteAccount: string,
    scope: "profile" | "logo",
    ttlMs: number
  ): Promise<string | null>;
  releaseLock(
    network: ValidatorNetwork,
    voteAccount: string,
    scope: "profile" | "logo",
    token: string
  ): Promise<void>;
}

const CACHE_PREFIX = "validator-profile:v2";
let redisCache: ValidatorProfileCache | null | undefined;

function cacheKey(
  network: ValidatorNetwork,
  voteAccount: string,
  group: ValidatorProfileCacheGroup
): string {
  return `${CACHE_PREFIX}:${network}:${encodeURIComponent(voteAccount)}:${group}`;
}

function lockKey(
  network: ValidatorNetwork,
  voteAccount: string,
  scope: "profile" | "logo"
): string {
  return `${CACHE_PREFIX}:lock:${scope}:${network}:${encodeURIComponent(voteAccount)}`;
}

function isValidValue(field: ValidatorProfileField, value: unknown): boolean {
  if (["name", "description", "logoUrl"].includes(field)) {
    return typeof value === "string" && value.trim().length > 0;
  }
  if (field === "mevEnabled") return typeof value === "boolean";
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  return value >= 0 && value <= 100;
}

function parseGroup(
  serialized: string | null,
  group: ValidatorProfileCacheGroup
): CachedProfileGroup | null {
  if (!serialized) return null;

  try {
    const value = JSON.parse(serialized) as Record<string, unknown>;
    if (
      value.version !== 1 ||
      typeof value.refreshedAt !== "number" ||
      !Number.isFinite(value.refreshedAt) ||
      value.records === null ||
      typeof value.records !== "object" ||
      Array.isArray(value.records)
    ) {
      return null;
    }

    const records: CachedProfileGroup["records"] = {};
    const rawRecords = value.records as Record<string, unknown>;
    for (const field of CACHE_GROUP_FIELDS[group]) {
      const rawRecord = rawRecords[field];
      if (
        rawRecord === null ||
        typeof rawRecord !== "object" ||
        Array.isArray(rawRecord)
      ) {
        continue;
      }
      const record = rawRecord as Record<string, unknown>;
      if (
        !isValidValue(field, record.value) ||
        typeof record.source !== "string" ||
        !record.source ||
        typeof record.observedAt !== "string" ||
        Number.isNaN(Date.parse(record.observedAt)) ||
        typeof record.cachedAt !== "number" ||
        !Number.isFinite(record.cachedAt)
      ) {
        continue;
      }
      records[field] = {
        value: record.value as CachedField["value"],
        source: record.source,
        observedAt: record.observedAt,
        cachedAt: record.cachedAt
      };
    }

    return { version: 1, refreshedAt: value.refreshedAt, records };
  } catch {
    return null;
  }
}

class RedisValidatorProfileCache implements ValidatorProfileCache {
  async read(
    network: ValidatorNetwork,
    voteAccount: string
  ): Promise<CachedProfileGroups> {
    const client = await getRedisClient();
    const serialized = await client.mGet(
      VALIDATOR_PROFILE_CACHE_GROUPS.map((group) =>
        cacheKey(network, voteAccount, group)
      )
    );

    return Object.fromEntries(
      VALIDATOR_PROFILE_CACHE_GROUPS.flatMap((group, index) => {
        const parsed = parseGroup(serialized[index], group);
        return parsed ? [[group, parsed]] : [];
      })
    );
  }

  async write(
    network: ValidatorNetwork,
    voteAccount: string,
    group: ValidatorProfileCacheGroup,
    value: CachedProfileGroup
  ): Promise<void> {
    const client = await getRedisClient();
    await client.set(
      cacheKey(network, voteAccount, group),
      JSON.stringify(value),
      {
        PX: CACHE_POLICIES[group].staleMs
      }
    );
  }

  async acquireLock(
    network: ValidatorNetwork,
    voteAccount: string,
    scope: "profile" | "logo",
    ttlMs: number
  ): Promise<string | null> {
    const client = await getRedisClient();
    const token = randomUUID();
    const result = await client.set(
      lockKey(network, voteAccount, scope),
      token,
      {
        NX: true,
        PX: ttlMs
      }
    );
    return result === "OK" ? token : null;
  }

  async releaseLock(
    network: ValidatorNetwork,
    voteAccount: string,
    scope: "profile" | "logo",
    token: string
  ): Promise<void> {
    const client = await getRedisClient();
    await client.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
      { keys: [lockKey(network, voteAccount, scope)], arguments: [token] }
    );
  }
}

export function getValidatorProfileCache(): ValidatorProfileCache | null {
  if (!isRedisConfigured()) return null;
  if (redisCache === undefined) redisCache = new RedisValidatorProfileCache();
  return redisCache;
}

export function fieldMetadata(
  record: CachedField,
  stale: boolean
): FieldMetadata {
  return {
    source: record.source,
    observedAt: record.observedAt,
    stale
  };
}
