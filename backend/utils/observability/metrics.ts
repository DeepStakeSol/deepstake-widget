import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics
} from "prom-client";

import {
  VALIDATOR_PROFILE_FIELDS,
  type ValidatorLogo,
  type ValidatorNetwork,
  type ValidatorProfile
} from "../validatorProfile/types";

export type ProviderOutcome =
  | "success"
  | "empty"
  | "timeout"
  | "http"
  | "parse"
  | "cancelled"
  | "network";

interface ValidatorProfileMetrics {
  registry: Registry;
  profileRequests: Counter<"network" | "status">;
  profileDuration: Histogram<"network" | "status">;
  logoRequests: Counter<"network" | "status">;
  logoDuration: Histogram<"network" | "status">;
  providerRequests: Counter<"provider" | "network" | "outcome">;
  providerDuration: Histogram<"provider" | "network" | "outcome">;
  providerInFlight: Gauge<"provider" | "network">;
  cacheOperations: Counter<"operation" | "result" | "group">;
  fieldStates: Counter<"network" | "field" | "state">;
  backgroundOperations: Counter<"kind" | "outcome">;
  walletCacheOperations: Counter<
    "resource" | "operation" | "result" | "network"
  >;
  walletCacheRefreshDuration: Histogram<"resource" | "outcome" | "network">;
}

const globalMetrics = globalThis as typeof globalThis & {
  __deepstakeValidatorProfileMetrics?: ValidatorProfileMetrics;
};

function createMetrics(): ValidatorProfileMetrics {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry, prefix: "deepstake_" });

  return {
    registry,
    profileRequests: new Counter({
      name: "deepstake_validator_profile_requests_total",
      help: "Validator profile responses by network and status.",
      labelNames: ["network", "status"],
      registers: [registry]
    }),
    profileDuration: new Histogram({
      name: "deepstake_validator_profile_request_duration_seconds",
      help: "Validator profile request duration in seconds.",
      labelNames: ["network", "status"],
      buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 8, 10],
      registers: [registry]
    }),
    logoRequests: new Counter({
      name: "deepstake_validator_logo_requests_total",
      help: "Validator logo responses by network and status.",
      labelNames: ["network", "status"],
      registers: [registry]
    }),
    logoDuration: new Histogram({
      name: "deepstake_validator_logo_request_duration_seconds",
      help: "Validator logo request duration in seconds.",
      labelNames: ["network", "status"],
      buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 8, 10],
      registers: [registry]
    }),
    providerRequests: new Counter({
      name: "deepstake_validator_provider_requests_total",
      help: "Validator provider attempts by bounded outcome.",
      labelNames: ["provider", "network", "outcome"],
      registers: [registry]
    }),
    providerDuration: new Histogram({
      name: "deepstake_validator_provider_request_duration_seconds",
      help: "Validator provider request duration in seconds.",
      labelNames: ["provider", "network", "outcome"],
      buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 8, 10],
      registers: [registry]
    }),
    providerInFlight: new Gauge({
      name: "deepstake_validator_provider_in_flight",
      help: "Current in-flight validator provider requests.",
      labelNames: ["provider", "network"],
      registers: [registry]
    }),
    cacheOperations: new Counter({
      name: "deepstake_validator_cache_operations_total",
      help: "Validator profile cache operations by result and cache group.",
      labelNames: ["operation", "result", "group"],
      registers: [registry]
    }),
    fieldStates: new Counter({
      name: "deepstake_validator_profile_field_states_total",
      help: "Fields returned as fresh, stale, or missing.",
      labelNames: ["network", "field", "state"],
      registers: [registry]
    }),
    backgroundOperations: new Counter({
      name: "deepstake_validator_background_operations_total",
      help: "Background validator enhancement and refresh outcomes.",
      labelNames: ["kind", "outcome"],
      registers: [registry]
    }),
    walletCacheOperations: new Counter({
      name: "deepstake_wallet_cache_operations_total",
      help: "Wallet data cache operations by resource, network, and result.",
      labelNames: ["resource", "operation", "result", "network"],
      registers: [registry]
    }),
    walletCacheRefreshDuration: new Histogram({
      name: "deepstake_wallet_cache_refresh_duration_seconds",
      help: "Wallet data provider refresh duration by resource and outcome.",
      labelNames: ["resource", "outcome", "network"],
      buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 15],
      registers: [registry]
    })
  };
}

export const validatorProfileMetrics =
  globalMetrics.__deepstakeValidatorProfileMetrics ?? createMetrics();
globalMetrics.__deepstakeValidatorProfileMetrics = validatorProfileMetrics;

export function observeProviderRequest(
  provider: string,
  network: ValidatorNetwork,
  outcome: ProviderOutcome,
  elapsedMs: number
): void {
  const labels = { provider, network, outcome };
  validatorProfileMetrics.providerRequests.inc(labels);
  validatorProfileMetrics.providerDuration.observe(labels, elapsedMs / 1_000);
}

export function recordCacheOperation(
  operation: string,
  result: string,
  group = "all"
): void {
  validatorProfileMetrics.cacheOperations.inc({ operation, result, group });
}

export function recordBackgroundOperation(
  kind: "enhancement" | "refresh",
  outcome: "success" | "error"
): void {
  validatorProfileMetrics.backgroundOperations.inc({ kind, outcome });
}

export function recordProfileResponse(
  network: ValidatorNetwork,
  profile: ValidatorProfile | null,
  elapsedMs: number
): void {
  const status = profile?.status ?? "error";
  validatorProfileMetrics.profileRequests.inc({ network, status });
  validatorProfileMetrics.profileDuration.observe(
    { network, status },
    elapsedMs / 1_000
  );

  if (!profile) return;
  for (const field of VALIDATOR_PROFILE_FIELDS) {
    if (field === "logoUrl") continue;
    const state =
      profile[field] === null
        ? "missing"
        : profile.fields[field].stale
          ? "stale"
          : "fresh";
    validatorProfileMetrics.fieldStates.inc({ network, field, state });
  }
}

export function recordLogoResponse(
  network: ValidatorNetwork,
  logo: ValidatorLogo | null,
  elapsedMs: number
): void {
  const status = logo?.status ?? "error";
  validatorProfileMetrics.logoRequests.inc({ network, status });
  validatorProfileMetrics.logoDuration.observe(
    { network, status },
    elapsedMs / 1_000
  );

  if (!logo) return;
  const state =
    logo.logoUrl === null ? "missing" : logo.field.stale ? "stale" : "fresh";
  validatorProfileMetrics.fieldStates.inc({
    network,
    field: "logoUrl",
    state
  });
}

export function recordWalletCacheOperation(
  resource: "native-stake" | "blaze-applied" | "vault-manage",
  operation: string,
  result: string,
  network: string
): void {
  validatorProfileMetrics.walletCacheOperations.inc({
    resource,
    operation,
    result,
    network
  });
}

export function observeWalletCacheRefresh(
  resource: "native-stake" | "blaze-applied" | "vault-manage",
  outcome: "success" | "error",
  network: string,
  elapsedMs: number
): void {
  validatorProfileMetrics.walletCacheRefreshDuration.observe(
    { resource, outcome, network },
    elapsedMs / 1_000
  );
}
