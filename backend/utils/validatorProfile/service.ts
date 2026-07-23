import {
  CACHE_GROUP_FIELDS,
  CACHE_POLICIES,
  VALIDATOR_PROFILE_CACHE_GROUPS,
  fieldMetadata,
  getValidatorProfileCache,
  type CachedProfileGroups,
  type ValidatorProfileCache,
  type ValidatorProfileCacheGroup
} from "./cache";
import {
  validatorProfileProviders,
  validatorProfileProvidersByGroup
} from "./providers";
import {
  VALIDATOR_PROFILE_FIELDS,
  type FieldMetadata,
  type ProviderResult,
  type ValidatorNetwork,
  type ValidatorProfile,
  type ValidatorProfileField,
  type ValidatorProfileProvider,
  type ValidatorProfileValues
} from "./types";

const AGGREGATION_TIMEOUT_MS = 3_000;
const DISTRIBUTED_LOCK_TTL_MS = 5_000;
const PEER_REFRESH_POLL_MS = 75;

const FIELD_PRECEDENCE: Record<ValidatorProfileField, string[]> = {
  name: ["stakewiz", "validators-app"],
  description: ["stakewiz", "validators-app"],
  logoUrl: ["stakewiz", "trillium", "validators-app"],
  estimatedApyPercent: ["stakewiz"],
  commissionPercent: ["solana-rpc", "stakewiz", "validators-app"],
  mevCommissionPercent: ["jito", "stakewiz"],
  mevEnabled: ["jito", "stakewiz"]
};

const inFlightRefreshes = new Map<string, Promise<ValidatorProfile>>();

function emptyValues(): ValidatorProfileValues {
  return {
    name: null,
    description: null,
    logoUrl: null,
    estimatedApyPercent: null,
    commissionPercent: null,
    mevCommissionPercent: null,
    mevEnabled: null
  };
}

function emptyFields(): ValidatorProfile["fields"] {
  return Object.fromEntries(
    VALIDATOR_PROFILE_FIELDS.map((field) => [
      field,
      { source: null, observedAt: null, stale: false } satisfies FieldMetadata
    ])
  ) as ValidatorProfile["fields"];
}

function mergeResults(results: ProviderResult[]): {
  values: ValidatorProfileValues;
  fields: ValidatorProfile["fields"];
} {
  const values = emptyValues();
  const fields = emptyFields();

  for (const field of VALIDATOR_PROFILE_FIELDS) {
    for (const source of FIELD_PRECEDENCE[field]) {
      const providerResult = results.find((item) => item.source === source);
      if (!providerResult) continue;
      const value = providerResult.values[field];
      if (value !== null && value !== undefined) {
        (values as Record<ValidatorProfileField, unknown>)[field] = value;
        fields[field] = {
          source,
          observedAt: providerResult.observedAt,
          stale: false
        };
        break;
      }
    }
  }

  return { values, fields };
}

function profileStatus(
  values: ValidatorProfileValues,
  hasStaleValue = false
): ValidatorProfile["status"] {
  const hasAnyValue = VALIDATOR_PROFILE_FIELDS.some(
    (field) => values[field] !== null
  );
  if (!hasAnyValue) return "unavailable";
  if (hasStaleValue) return "stale";

  const coreComplete =
    values.name !== null &&
    values.estimatedApyPercent !== null &&
    values.commissionPercent !== null &&
    values.mevEnabled !== null &&
    (values.mevEnabled === false || values.mevCommissionPercent !== null);
  return coreComplete ? "fresh" : "partial";
}

function directProfile(
  network: ValidatorNetwork,
  voteAccount: string,
  results: ProviderResult[]
): ValidatorProfile {
  const { values, fields } = mergeResults(results);
  return {
    network,
    voteAccount,
    ...values,
    status: profileStatus(values),
    fields
  };
}

function cachedProfile(
  network: ValidatorNetwork,
  voteAccount: string,
  groups: CachedProfileGroups,
  now: number
): ValidatorProfile {
  const values = emptyValues();
  const fields = emptyFields();
  let hasStaleValue = false;

  for (const group of VALIDATOR_PROFILE_CACHE_GROUPS) {
    const cached = groups[group];
    if (!cached) continue;
    const policy = CACHE_POLICIES[group];

    for (const field of CACHE_GROUP_FIELDS[group]) {
      const record = cached.records[field];
      if (!record || now - record.cachedAt > policy.staleMs) continue;
      const stale = now - record.cachedAt > policy.freshMs;
      (values as Record<ValidatorProfileField, unknown>)[field] = record.value;
      fields[field] = fieldMetadata(record, stale);
      hasStaleValue ||= stale;
    }
  }

  return {
    network,
    voteAccount,
    ...values,
    status: profileStatus(values, hasStaleValue),
    fields
  };
}

function groupsNeedingRefresh(
  groups: CachedProfileGroups,
  now: number
): ValidatorProfileCacheGroup[] {
  return VALIDATOR_PROFILE_CACHE_GROUPS.filter((group) => {
    const refreshedAt = groups[group]?.refreshedAt;
    return (
      refreshedAt === undefined ||
      now - refreshedAt > CACHE_POLICIES[group].freshMs
    );
  });
}

function hasUsableCachedValue(
  groups: CachedProfileGroups,
  now: number
): boolean {
  return VALIDATOR_PROFILE_CACHE_GROUPS.some((group) =>
    CACHE_GROUP_FIELDS[group].some((field) => {
      const record = groups[group]?.records[field];
      return Boolean(
        record && now - record.cachedAt <= CACHE_POLICIES[group].staleMs
      );
    })
  );
}

function providersForGroups(
  groups: ValidatorProfileCacheGroup[],
  providers?: ValidatorProfileProvider[]
): ValidatorProfileProvider[] {
  if (providers) return providers;
  return [
    ...new Set(
      groups.flatMap((group) => validatorProfileProvidersByGroup[group])
    )
  ];
}

async function requestProviders(
  network: ValidatorNetwork,
  voteAccount: string,
  providers: ValidatorProfileProvider[],
  timeoutMs: number
): Promise<ProviderResult[]> {
  const controller = new AbortController();
  const results: ProviderResult[] = [];
  let deadline: ReturnType<typeof setTimeout> | undefined;

  const requests = providers.map(async (provider) => {
    try {
      const providerResult = await provider({
        network,
        voteAccount,
        signal: controller.signal
      });
      if (providerResult) results.push(providerResult);
    } catch (error) {
      console.warn("Validator profile provider failed", {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  await Promise.race([
    Promise.allSettled(requests),
    new Promise<void>((resolve) => {
      deadline = setTimeout(resolve, timeoutMs);
    })
  ]);
  if (deadline) clearTimeout(deadline);
  controller.abort(new Error("Validator profile aggregation deadline reached"));
  return results;
}

function coalescedDirectRequest(
  network: ValidatorNetwork,
  voteAccount: string,
  providers: ValidatorProfileProvider[],
  timeoutMs: number
): Promise<ValidatorProfile> {
  const key = `${network}:${voteAccount}`;
  const existing = inFlightRefreshes.get(key);
  if (existing) return existing;

  const request = requestProviders(network, voteAccount, providers, timeoutMs)
    .then((results) => directProfile(network, voteAccount, results))
    .finally(() => {
      if (inFlightRefreshes.get(key) === request) inFlightRefreshes.delete(key);
    });
  inFlightRefreshes.set(key, request);
  return request;
}

function mergeIntoCachedGroups(
  current: CachedProfileGroups,
  profile: ValidatorProfile,
  targetGroups: ValidatorProfileCacheGroup[],
  now: number
): {
  groups: CachedProfileGroups;
  changed: ValidatorProfileCacheGroup[];
} {
  const groups = { ...current };
  const changed: ValidatorProfileCacheGroup[] = [];

  for (const group of targetGroups) {
    const existing = current[group];
    const records = { ...existing?.records };
    let receivedValidValue = false;

    for (const field of CACHE_GROUP_FIELDS[group]) {
      const value = profile[field];
      const metadata = profile.fields[field];
      if (
        value === null ||
        metadata.source === null ||
        metadata.observedAt === null
      ) {
        continue;
      }
      records[field] = {
        value,
        source: metadata.source,
        observedAt: metadata.observedAt,
        cachedAt: now
      };
      receivedValidValue = true;
    }

    if (receivedValidValue) {
      groups[group] = { version: 1, refreshedAt: now, records };
      changed.push(group);
    }
  }

  return { groups, changed };
}

async function readCache(
  cache: ValidatorProfileCache,
  network: ValidatorNetwork,
  voteAccount: string
): Promise<CachedProfileGroups | null> {
  try {
    return await cache.read(network, voteAccount);
  } catch (error) {
    console.warn("Validator profile cache unavailable", {
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

async function aggregateAndCache(
  network: ValidatorNetwork,
  voteAccount: string,
  targetGroups: ValidatorProfileCacheGroup[],
  currentGroups: CachedProfileGroups,
  providers: ValidatorProfileProvider[],
  timeoutMs: number,
  cache: ValidatorProfileCache
): Promise<ValidatorProfile> {
  const results = await requestProviders(
    network,
    voteAccount,
    providers,
    timeoutMs
  );
  const fresh = directProfile(network, voteAccount, results);
  const now = Date.now();
  const merged = mergeIntoCachedGroups(currentGroups, fresh, targetGroups, now);

  await Promise.all(
    merged.changed.map(async (group) => {
      try {
        await cache.write(network, voteAccount, group, merged.groups[group]!);
      } catch (error) {
        console.warn("Validator profile cache write failed", {
          group,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    })
  );

  return cachedProfile(network, voteAccount, merged.groups, now);
}

async function refreshWithLock(
  network: ValidatorNetwork,
  voteAccount: string,
  targetGroups: ValidatorProfileCacheGroup[],
  currentGroups: CachedProfileGroups,
  providers: ValidatorProfileProvider[],
  timeoutMs: number,
  cache: ValidatorProfileCache
): Promise<ValidatorProfile> {
  let lockToken: string | null;
  try {
    lockToken = await cache.acquireLock(
      network,
      voteAccount,
      DISTRIBUTED_LOCK_TTL_MS
    );
  } catch (error) {
    console.warn("Validator profile cache lock unavailable", {
      error: error instanceof Error ? error.message : String(error)
    });
    return directProfile(
      network,
      voteAccount,
      await requestProviders(network, voteAccount, providers, timeoutMs)
    );
  }

  if (!lockToken) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, PEER_REFRESH_POLL_MS));
      const peerGroups = await readCache(cache, network, voteAccount);
      if (peerGroups && hasUsableCachedValue(peerGroups, Date.now())) {
        return cachedProfile(network, voteAccount, peerGroups, Date.now());
      }
    }
    return aggregateAndCache(
      network,
      voteAccount,
      targetGroups,
      currentGroups,
      providers,
      timeoutMs,
      cache
    );
  }

  try {
    return await aggregateAndCache(
      network,
      voteAccount,
      targetGroups,
      currentGroups,
      providers,
      timeoutMs,
      cache
    );
  } finally {
    try {
      await cache.releaseLock(network, voteAccount, lockToken);
    } catch (error) {
      console.warn("Validator profile cache lock release failed", {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

function coalescedRefresh(
  network: ValidatorNetwork,
  voteAccount: string,
  targetGroups: ValidatorProfileCacheGroup[],
  currentGroups: CachedProfileGroups,
  providers: ValidatorProfileProvider[],
  timeoutMs: number,
  cache: ValidatorProfileCache
): Promise<ValidatorProfile> {
  const key = `${network}:${voteAccount}`;
  const existing = inFlightRefreshes.get(key);
  if (existing) return existing;

  const refresh = refreshWithLock(
    network,
    voteAccount,
    targetGroups,
    currentGroups,
    providers,
    timeoutMs,
    cache
  ).finally(() => {
    if (inFlightRefreshes.get(key) === refresh) inFlightRefreshes.delete(key);
  });
  inFlightRefreshes.set(key, refresh);
  return refresh;
}

export async function getValidatorProfile(
  network: ValidatorNetwork,
  voteAccount: string,
  providers: ValidatorProfileProvider[] | undefined = undefined,
  timeoutMs = AGGREGATION_TIMEOUT_MS,
  cache: ValidatorProfileCache | null = getValidatorProfileCache()
): Promise<ValidatorProfile> {
  if (!cache) {
    return coalescedDirectRequest(
      network,
      voteAccount,
      providers ?? validatorProfileProviders,
      timeoutMs
    );
  }

  const currentGroups = await readCache(cache, network, voteAccount);
  if (!currentGroups) {
    return coalescedDirectRequest(
      network,
      voteAccount,
      providers ?? validatorProfileProviders,
      timeoutMs
    );
  }

  const now = Date.now();
  const targetGroups = groupsNeedingRefresh(currentGroups, now);
  const cached = cachedProfile(network, voteAccount, currentGroups, now);
  if (targetGroups.length === 0) return cached;

  const selectedProviders = providersForGroups(targetGroups, providers);
  const refresh = coalescedRefresh(
    network,
    voteAccount,
    targetGroups,
    currentGroups,
    selectedProviders,
    timeoutMs,
    cache
  );

  if (hasUsableCachedValue(currentGroups, now)) {
    void refresh.catch((error) => {
      console.warn("Validator profile background refresh failed", {
        error: error instanceof Error ? error.message : String(error)
      });
    });
    return cached;
  }

  return refresh;
}
