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
import { validatorProfileProviderConfigsByGroup } from "./providers";
import { errorMessage, operationalLog } from "../observability/logger";
import {
  observeProviderRequest,
  recordBackgroundOperation,
  recordCacheOperation,
  validatorProfileMetrics,
  type ProviderOutcome
} from "../observability/metrics";
import {
  VALIDATOR_PROFILE_FIELDS,
  type FieldMetadata,
  type ProviderResult,
  type ValidatorLogo,
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

type ProfileField = Exclude<ValidatorProfileField, "logoUrl">;

const PROFILE_CACHE_GROUPS = VALIDATOR_PROFILE_CACHE_GROUPS.filter(
  (group) => group !== "logo"
);
const PROFILE_FIELDS = VALIDATOR_PROFILE_FIELDS.filter(
  (field): field is ProfileField => field !== "logoUrl"
);

const CACHE_GROUP_ANCHOR_FIELDS: Record<
  ValidatorProfileCacheGroup,
  ValidatorProfileField
> = {
  identity: "name",
  logo: "logoUrl",
  commission: "commissionPercent",
  apy: "estimatedApyPercent",
  mev: "mevEnabled"
};

const FIELD_PRECEDENCE: Record<ProfileField, string[]> = {
  name: ["stakewiz", "validators-app"],
  description: ["stakewiz", "validators-app"],
  estimatedApyPercent: ["stakewiz"],
  commissionPercent: ["solana-rpc", "stakewiz", "validators-app"],
  mevCommissionPercent: ["jito", "stakewiz"],
  mevEnabled: ["jito", "stakewiz"]
};

const inFlightRefreshes = new Map<string, Promise<ValidatorProfile>>();
const inFlightLogoRefreshes = new Map<string, Promise<ValidatorLogo>>();

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

  for (const field of PROFILE_FIELDS) {
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

  for (const group of PROFILE_CACHE_GROUPS) {
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
  now: number,
  candidates: ValidatorProfileCacheGroup[] = PROFILE_CACHE_GROUPS
): ValidatorProfileCacheGroup[] {
  return candidates.filter((group) => {
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
  now: number,
  candidates: ValidatorProfileCacheGroup[] = PROFILE_CACHE_GROUPS
): boolean {
  return candidates.some((group) =>
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

function providerFailureKind(
  error: unknown,
  timedOut: boolean
): Exclude<ProviderOutcome, "success" | "empty"> {
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
  let outcome: ProviderOutcome = "network";

  validatorProfileMetrics.providerInFlight.inc({
    provider: configuration.id,
    network
  });

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
    const result = await Promise.race([
      configuration.provider({
        network,
        voteAccount,
        signal: controller.signal
      }),
      deadline
    ]);
    outcome = result && hasProviderValue(result) ? "success" : "empty";
    return result;
  } catch (error) {
    outcome = providerFailureKind(error, timedOut);
    operationalLog("warn", "validator_profile_provider_failed", {
      provider: configuration.id,
      network,
      kind: outcome,
      elapsedMs: Date.now() - startedAt,
      timeoutMs: configuration.timeoutMs,
      error: errorMessage(error)
    });
    return null;
  } finally {
    if (timeout) clearTimeout(timeout);
    observeProviderRequest(
      configuration.id,
      network,
      outcome,
      Date.now() - startedAt
    );
    validatorProfileMetrics.providerInFlight.dec({
      provider: configuration.id,
      network
    });
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
  const key = `profile:${network}:${voteAccount}`;
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
    const groups = await cache.read(network, voteAccount);
    recordCacheOperation(
      "read",
      Object.keys(groups).length > 0 ? "hit" : "miss"
    );
    return groups;
  } catch (error) {
    recordCacheOperation("read", "error");
    operationalLog("warn", "validator_profile_cache_read_failed", {
      network,
      error: errorMessage(error)
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
        recordCacheOperation("write", "success", group);
      } catch (error) {
        recordCacheOperation("write", "error", group);
        operationalLog("warn", "validator_profile_cache_write_failed", {
          network,
          group,
          error: errorMessage(error)
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
  scope: "profile" | "logo",
  token: string
): Promise<void> {
  try {
    await cache.releaseLock(network, voteAccount, scope, token);
    recordCacheOperation("lock_release", "success");
  } catch (error) {
    recordCacheOperation("lock_release", "error");
    operationalLog("warn", "validator_profile_cache_lock_release_failed", {
      network,
      error: errorMessage(error)
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
      "profile",
      DISTRIBUTED_LOCK_TTL_MS
    );
    recordCacheOperation("lock_acquire", lockToken ? "acquired" : "contended");
  } catch (error) {
    recordCacheOperation("lock_acquire", "error");
    operationalLog("warn", "validator_profile_cache_lock_failed", {
      network,
      error: errorMessage(error)
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
        .then(() => recordBackgroundOperation("enhancement", "success"))
        .catch((error) => {
          recordBackgroundOperation("enhancement", "error");
          operationalLog(
            "warn",
            "validator_profile_background_enhancement_failed",
            {
              network,
              error: errorMessage(error)
            }
          );
        })
        .finally(() =>
          releaseCacheLock(cache, network, voteAccount, "profile", lockToken!)
        );
    }
    return staged.profile;
  } finally {
    if (!releaseInBackground) {
      await releaseCacheLock(cache, network, voteAccount, "profile", lockToken);
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
  const key = `profile:${network}:${voteAccount}`;
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
    : providerConfigsForGroups(PROFILE_CACHE_GROUPS, undefined, timeoutMs);

  if (!cache) {
    recordCacheOperation("lookup", "disabled");
    return coalescedDirectRequest(
      network,
      voteAccount,
      allConfigurations,
      fastBaseline
    );
  }

  const currentGroups = await readCache(cache, network, voteAccount);
  if (!currentGroups) {
    recordCacheOperation("lookup", "error");
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
  if (targetGroups.length === 0) {
    recordCacheOperation("lookup", "fresh");
    return cached;
  }

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
    recordCacheOperation("lookup", "stale");
    void refresh
      .then(() => recordBackgroundOperation("refresh", "success"))
      .catch((error) => {
        recordBackgroundOperation("refresh", "error");
        operationalLog("warn", "validator_profile_background_refresh_failed", {
          network,
          error: errorMessage(error)
        });
      });
    return cached;
  }

  recordCacheOperation(
    "lookup",
    Object.keys(currentGroups).length === 0 ? "miss" : "expired"
  );
  return refresh;
}

function unavailableLogo(
  network: ValidatorNetwork,
  voteAccount: string
): ValidatorLogo {
  return {
    network,
    voteAccount,
    logoUrl: null,
    status: "unavailable",
    field: { source: null, observedAt: null, stale: false }
  };
}

function logoFromProviderResult(
  network: ValidatorNetwork,
  voteAccount: string,
  result: ProviderResult | null
): ValidatorLogo | null {
  if (!result) return null;
  const logoUrl = result.values.logoUrl;
  if (typeof logoUrl !== "string" || !logoUrl.trim()) return null;
  return {
    network,
    voteAccount,
    logoUrl,
    status: "fresh",
    field: {
      source: result.source,
      observedAt: result.observedAt,
      stale: false
    }
  };
}

function cachedLogo(
  network: ValidatorNetwork,
  voteAccount: string,
  groups: CachedProfileGroups,
  now: number
): ValidatorLogo {
  const record = groups.logo?.records.logoUrl;
  if (!record || now - record.cachedAt > CACHE_POLICIES.logo.staleMs) {
    return unavailableLogo(network, voteAccount);
  }
  const stale = now - record.cachedAt > CACHE_POLICIES.logo.freshMs;
  return {
    network,
    voteAccount,
    logoUrl: record.value as string,
    status: stale ? "stale" : "fresh",
    field: fieldMetadata(record, stale)
  };
}

async function directLogoRequest(
  network: ValidatorNetwork,
  voteAccount: string,
  configurations: ValidatorProfileProviderConfig[]
): Promise<ValidatorLogo> {
  const requests = configurations.map((configuration) => ({
    configuration,
    request: requestProvider(network, voteAccount, configuration)
  }));

  for (const { request } of requests) {
    const logo = logoFromProviderResult(network, voteAccount, await request);
    if (logo) return logo;
  }
  return unavailableLogo(network, voteAccount);
}

function coalescedLogoRequest(
  network: ValidatorNetwork,
  voteAccount: string,
  requestFactory: () => Promise<ValidatorLogo>
): Promise<ValidatorLogo> {
  const key = `logo:${network}:${voteAccount}`;
  const existing = inFlightLogoRefreshes.get(key);
  if (existing) return existing;

  const request = requestFactory().finally(() => {
    if (inFlightLogoRefreshes.get(key) === request) {
      inFlightLogoRefreshes.delete(key);
    }
  });
  inFlightLogoRefreshes.set(key, request);
  return request;
}

async function cacheLogo(
  cache: ValidatorProfileCache,
  logo: ValidatorLogo
): Promise<void> {
  if (!logo.logoUrl || !logo.field.source || !logo.field.observedAt) {
    return;
  }
  const now = Date.now();
  try {
    await cache.write(logo.network, logo.voteAccount, "logo", {
      version: 1,
      refreshedAt: now,
      records: {
        logoUrl: {
          value: logo.logoUrl,
          source: logo.field.source,
          observedAt: logo.field.observedAt,
          cachedAt: now
        }
      }
    });
    recordCacheOperation("write", "success", "logo");
  } catch (error) {
    recordCacheOperation("write", "error", "logo");
    operationalLog("warn", "validator_logo_cache_write_failed", {
      network: logo.network,
      error: errorMessage(error)
    });
  }
}

async function refreshLogoWithLock(
  network: ValidatorNetwork,
  voteAccount: string,
  configurations: ValidatorProfileProviderConfig[],
  cache: ValidatorProfileCache
): Promise<ValidatorLogo> {
  let lockToken: string | null;
  try {
    lockToken = await cache.acquireLock(
      network,
      voteAccount,
      "logo",
      DISTRIBUTED_LOCK_TTL_MS
    );
    recordCacheOperation(
      "lock_acquire",
      lockToken ? "acquired" : "contended",
      "logo"
    );
  } catch (error) {
    recordCacheOperation("lock_acquire", "error", "logo");
    operationalLog("warn", "validator_logo_cache_lock_failed", {
      network,
      error: errorMessage(error)
    });
    return directLogoRequest(network, voteAccount, configurations);
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
      if (peerGroups) {
        const peerLogo = cachedLogo(
          network,
          voteAccount,
          peerGroups,
          Date.now()
        );
        if (peerLogo.logoUrl) return peerLogo;
      }
    }
    const logo = await directLogoRequest(network, voteAccount, configurations);
    await cacheLogo(cache, logo);
    return logo;
  }

  try {
    const logo = await directLogoRequest(network, voteAccount, configurations);
    await cacheLogo(cache, logo);
    return logo;
  } finally {
    await releaseCacheLock(cache, network, voteAccount, "logo", lockToken);
  }
}

export async function getValidatorLogo(
  network: ValidatorNetwork,
  voteAccount: string,
  providers: ValidatorProfileProvider[] | undefined = undefined,
  timeoutMs = CUSTOM_PROVIDER_TIMEOUT_MS,
  cache: ValidatorProfileCache | null = getValidatorProfileCache()
): Promise<ValidatorLogo> {
  const configurations = providers
    ? customProviderConfigs(providers, timeoutMs)
    : providerConfigsForGroups(["logo"], undefined, timeoutMs);

  if (!cache) {
    recordCacheOperation("lookup", "disabled", "logo");
    return coalescedLogoRequest(network, voteAccount, () =>
      directLogoRequest(network, voteAccount, configurations)
    );
  }

  const groups = await readCache(cache, network, voteAccount);
  if (!groups) {
    recordCacheOperation("lookup", "error", "logo");
    return coalescedLogoRequest(network, voteAccount, () =>
      directLogoRequest(network, voteAccount, configurations)
    );
  }

  const now = Date.now();
  const logo = cachedLogo(network, voteAccount, groups, now);
  const needsRefresh = groupsNeedingRefresh(groups, now, ["logo"]).length > 0;
  if (!needsRefresh) {
    recordCacheOperation("lookup", "fresh", "logo");
    return logo;
  }

  const refresh = coalescedLogoRequest(network, voteAccount, () =>
    refreshLogoWithLock(network, voteAccount, configurations, cache)
  );
  if (logo.logoUrl) {
    recordCacheOperation("lookup", "stale", "logo");
    void refresh
      .then(() => recordBackgroundOperation("refresh", "success"))
      .catch((error) => {
        recordBackgroundOperation("refresh", "error");
        operationalLog("warn", "validator_logo_background_refresh_failed", {
          network,
          error: errorMessage(error)
        });
      });
    return logo;
  }

  recordCacheOperation("lookup", groups.logo ? "expired" : "miss", "logo");
  return refresh;
}
