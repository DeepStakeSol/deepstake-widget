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
  validatorProfileProviderConfigs,
  validatorProfileProviderConfigsByGroup
} from "./providers";
import {
  VALIDATOR_PROFILE_FIELDS,
  type FieldMetadata,
  type ProviderResult,
  type ValidatorNetwork,
  type ValidatorProfile,
  type ValidatorProfileField,
  type ValidatorProfileProvider,
  type ValidatorProfileProviderConfig,
  type ValidatorProfileValues
} from "./types";

const CUSTOM_PROVIDER_TIMEOUT_MS = 3_000;
const DISTRIBUTED_LOCK_TTL_MS = 12_000;
const PEER_REFRESH_POLL_MS = 75;

const CACHE_GROUP_ANCHOR_FIELDS: Record<
  ValidatorProfileCacheGroup,
  ValidatorProfileField
> = {
  identity: "name",
  commission: "commissionPercent",
  apy: "estimatedApyPercent",
  mev: "mevEnabled"
};

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

interface CachedAggregation {
  profile: ValidatorProfile;
  groups: CachedProfileGroups;
}

interface StagedAggregation extends CachedAggregation {
  completion: Promise<void> | null;
}

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

function hasProviderValue(result: ProviderResult): boolean {
  return VALIDATOR_PROFILE_FIELDS.some(
    (field) =>
      result.values[field] !== null && result.values[field] !== undefined
  );
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
    const cached = groups[group];
    const refreshedAt = cached?.refreshedAt;
    const anchor = cached?.records[CACHE_GROUP_ANCHOR_FIELDS[group]];
    return (
      refreshedAt === undefined ||
      anchor === undefined ||
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

function customProviderConfigs(
  providers: ValidatorProfileProvider[],
  timeoutMs: number
): ValidatorProfileProviderConfig[] {
  return providers.map((provider, index) => ({
    id: provider.name || `custom-provider-${index + 1}`,
    timeoutMs,
    provider
  }));
}

function providerConfigsForGroups(
  groups: ValidatorProfileCacheGroup[],
  providers: ValidatorProfileProvider[] | undefined,
  timeoutMs: number
): ValidatorProfileProviderConfig[] {
  if (providers) return customProviderConfigs(providers, timeoutMs);

  const configurations = groups.flatMap(
    (group) => validatorProfileProviderConfigsByGroup[group]
  );
  return [
    ...new Map(
      configurations.map((configuration) => [configuration.id, configuration])
    ).values()
  ];
}

function providerFailureKind(error: unknown, timedOut: boolean): string {
  if (timedOut) return "timeout";
  const message = error instanceof Error ? error.message : String(error);
  if (/HTTP \d+/.test(message)) return "http";
  if (/Unexpected .* response format/.test(message)) return "parse";
  if (error instanceof Error && error.name === "AbortError") return "cancelled";
  return "network";
}

async function requestProvider(
  network: ValidatorNetwork,
  voteAccount: string,
  configuration: ValidatorProfileProviderConfig
): Promise<ProviderResult | null> {
  const controller = new AbortController();
  const startedAt = Date.now();
  let timedOut = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      timedOut = true;
      const error = new Error(
        `Provider exceeded ${configuration.timeoutMs}ms timeout`
      );
      controller.abort(error);
      reject(error);
    }, configuration.timeoutMs);
  });

  try {
    return await Promise.race([
      configuration.provider({
        network,
        voteAccount,
        signal: controller.signal
      }),
      deadline
    ]);
  } catch (error) {
    console.warn("Validator profile provider failed", {
      provider: configuration.id,
      kind: providerFailureKind(error, timedOut),
      elapsedMs: Date.now() - startedAt,
      timeoutMs: configuration.timeoutMs,
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function requestProviders(
  network: ValidatorNetwork,
  voteAccount: string,
  configurations: ValidatorProfileProviderConfig[]
): Promise<ProviderResult[]> {
  const results = await Promise.all(
    configurations.map((configuration) =>
      requestProvider(network, voteAccount, configuration)
    )
  );
  return results.filter((result): result is ProviderResult => result !== null);
}

async function directStagedProfile(
  network: ValidatorNetwork,
  voteAccount: string,
  configurations: ValidatorProfileProviderConfig[],
  fastBaseline: boolean
): Promise<ValidatorProfile> {
  const baseline = fastBaseline
    ? configurations.find((configuration) => configuration.baseline)
    : undefined;
  if (!baseline) {
    return directProfile(
      network,
      voteAccount,
      await requestProviders(network, voteAccount, configurations)
    );
  }

  const enhancements = requestProviders(
    network,
    voteAccount,
    configurations.filter((configuration) => configuration !== baseline)
  );
  const baselineResult = await requestProvider(network, voteAccount, baseline);
  if (baselineResult && hasProviderValue(baselineResult)) {
    void enhancements.catch(() => undefined);
    return directProfile(network, voteAccount, [baselineResult]);
  }

  return directProfile(network, voteAccount, await enhancements);
}

function coalescedDirectRequest(
  network: ValidatorNetwork,
  voteAccount: string,
  configurations: ValidatorProfileProviderConfig[],
  fastBaseline: boolean
): Promise<ValidatorProfile> {
  const key = `${network}:${voteAccount}`;
  const existing = inFlightRefreshes.get(key);
  if (existing) return existing;

  const request = directStagedProfile(
    network,
    voteAccount,
    configurations,
    fastBaseline
  ).finally(() => {
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

async function cacheProviderResults(
  network: ValidatorNetwork,
  voteAccount: string,
  targetGroups: ValidatorProfileCacheGroup[],
  currentGroups: CachedProfileGroups,
  results: ProviderResult[],
  cache: ValidatorProfileCache
): Promise<CachedAggregation> {
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

  return {
    profile: cachedProfile(network, voteAccount, merged.groups, now),
    groups: merged.groups
  };
}

async function aggregateAndCache(
  network: ValidatorNetwork,
  voteAccount: string,
  targetGroups: ValidatorProfileCacheGroup[],
  currentGroups: CachedProfileGroups,
  configurations: ValidatorProfileProviderConfig[],
  cache: ValidatorProfileCache
): Promise<CachedAggregation> {
  const results = await requestProviders(network, voteAccount, configurations);
  return cacheProviderResults(
    network,
    voteAccount,
    targetGroups,
    currentGroups,
    results,
    cache
  );
}

async function stagedAggregateAndCache(
  network: ValidatorNetwork,
  voteAccount: string,
  targetGroups: ValidatorProfileCacheGroup[],
  currentGroups: CachedProfileGroups,
  configurations: ValidatorProfileProviderConfig[],
  cache: ValidatorProfileCache,
  fastBaseline: boolean
): Promise<StagedAggregation> {
  const baseline = fastBaseline
    ? configurations.find((configuration) => configuration.baseline)
    : undefined;
  if (!baseline) {
    const aggregated = await aggregateAndCache(
      network,
      voteAccount,
      targetGroups,
      currentGroups,
      configurations,
      cache
    );
    return { ...aggregated, completion: null };
  }

  const enhancementResults = requestProviders(
    network,
    voteAccount,
    configurations.filter((configuration) => configuration !== baseline)
  );
  const baselineResult = await requestProvider(network, voteAccount, baseline);

  if (!baselineResult || !hasProviderValue(baselineResult)) {
    const aggregated = await cacheProviderResults(
      network,
      voteAccount,
      targetGroups,
      currentGroups,
      await enhancementResults,
      cache
    );
    return { ...aggregated, completion: null };
  }

  const baselineAggregation = await cacheProviderResults(
    network,
    voteAccount,
    targetGroups,
    currentGroups,
    [baselineResult],
    cache
  );
  const completion = enhancementResults.then(async (results) => {
    if (results.length === 0) return;
    await cacheProviderResults(
      network,
      voteAccount,
      targetGroups,
      baselineAggregation.groups,
      [baselineResult, ...results],
      cache
    );
  });

  return { ...baselineAggregation, completion };
}

async function releaseCacheLock(
  cache: ValidatorProfileCache,
  network: ValidatorNetwork,
  voteAccount: string,
  token: string
): Promise<void> {
  try {
    await cache.releaseLock(network, voteAccount, token);
  } catch (error) {
    console.warn("Validator profile cache lock release failed", {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

async function refreshWithLock(
  network: ValidatorNetwork,
  voteAccount: string,
  targetGroups: ValidatorProfileCacheGroup[],
  currentGroups: CachedProfileGroups,
  configurations: ValidatorProfileProviderConfig[],
  cache: ValidatorProfileCache,
  fastBaseline: boolean
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
    return directStagedProfile(
      network,
      voteAccount,
      configurations,
      fastBaseline
    );
  }

  if (!lockToken) {
    const waitMs = Math.max(
      CUSTOM_PROVIDER_TIMEOUT_MS,
      ...configurations.map((configuration) => configuration.timeoutMs)
    );
    const deadline = Date.now() + waitMs;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, PEER_REFRESH_POLL_MS));
      const peerGroups = await readCache(cache, network, voteAccount);
      if (peerGroups && hasUsableCachedValue(peerGroups, Date.now())) {
        return cachedProfile(network, voteAccount, peerGroups, Date.now());
      }
    }
    return (
      await aggregateAndCache(
        network,
        voteAccount,
        targetGroups,
        currentGroups,
        configurations,
        cache
      )
    ).profile;
  }

  let releaseInBackground = false;
  try {
    const staged = await stagedAggregateAndCache(
      network,
      voteAccount,
      targetGroups,
      currentGroups,
      configurations,
      cache,
      fastBaseline
    );
    if (staged.completion) {
      releaseInBackground = true;
      void staged.completion
        .catch((error) => {
          console.warn("Validator profile background enhancement failed", {
            error: error instanceof Error ? error.message : String(error)
          });
        })
        .finally(() =>
          releaseCacheLock(cache, network, voteAccount, lockToken!)
        );
    }
    return staged.profile;
  } finally {
    if (!releaseInBackground) {
      await releaseCacheLock(cache, network, voteAccount, lockToken);
    }
  }
}

function coalescedRefresh(
  network: ValidatorNetwork,
  voteAccount: string,
  targetGroups: ValidatorProfileCacheGroup[],
  currentGroups: CachedProfileGroups,
  configurations: ValidatorProfileProviderConfig[],
  cache: ValidatorProfileCache,
  fastBaseline: boolean
): Promise<ValidatorProfile> {
  const key = `${network}:${voteAccount}`;
  const existing = inFlightRefreshes.get(key);
  if (existing) return existing;

  const refresh = refreshWithLock(
    network,
    voteAccount,
    targetGroups,
    currentGroups,
    configurations,
    cache,
    fastBaseline
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
  timeoutMs = CUSTOM_PROVIDER_TIMEOUT_MS,
  cache: ValidatorProfileCache | null = getValidatorProfileCache()
): Promise<ValidatorProfile> {
  const fastBaseline = providers === undefined;
  const allConfigurations = providers
    ? customProviderConfigs(providers, timeoutMs)
    : validatorProfileProviderConfigs;

  if (!cache) {
    return coalescedDirectRequest(
      network,
      voteAccount,
      allConfigurations,
      fastBaseline
    );
  }

  const currentGroups = await readCache(cache, network, voteAccount);
  if (!currentGroups) {
    return coalescedDirectRequest(
      network,
      voteAccount,
      allConfigurations,
      fastBaseline
    );
  }

  const now = Date.now();
  const targetGroups = groupsNeedingRefresh(currentGroups, now);
  const cached = cachedProfile(network, voteAccount, currentGroups, now);
  if (targetGroups.length === 0) return cached;

  const selectedConfigurations = providerConfigsForGroups(
    targetGroups,
    providers,
    timeoutMs
  );
  const refresh = coalescedRefresh(
    network,
    voteAccount,
    targetGroups,
    currentGroups,
    selectedConfigurations,
    cache,
    fastBaseline
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
