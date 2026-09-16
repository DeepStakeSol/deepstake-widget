import type { Options } from "../../options";
import { fetchBackendJson } from "../backendRequest";
import type { NetworkType } from "../config";

const VALIDATOR_INFO_URL = "https://api.stakewiz.com/validator";
const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

export type ValidatorProfileStatus =
  | "fresh"
  | "partial"
  | "stale"
  | "unavailable";

export type ValidatorProfileField =
  | "name"
  | "description"
  | "logoUrl"
  | "estimatedApyPercent"
  | "commissionPercent"
  | "mevCommissionPercent"
  | "mevEnabled";

export interface ValidatorFieldMetadata {
  source: string | null;
  observedAt: string | null;
  stale: boolean;
}

export interface ValidatorLogo {
  network: NetworkType;
  voteAccount: string;
  logoUrl: string | null;
  status: "fresh" | "stale" | "unavailable";
  field: ValidatorFieldMetadata;
}

export interface ValidatorProfile {
  network: NetworkType;
  voteAccount: string;
  name: string | null;
  description: string | null;
  logoUrl: string | null;
  estimatedApyPercent: number | null;
  commissionPercent: number | null;
  mevCommissionPercent: number | null;
  mevEnabled: boolean | null;
  status: ValidatorProfileStatus;
  fields: Record<ValidatorProfileField, ValidatorFieldMetadata>;
}

interface LegacyStakewizResponse {
  vote_identity?: unknown;
  name?: unknown;
  description?: unknown;
  total_apy?: unknown;
  commission?: unknown;
  jito_commission_bps?: unknown;
  is_jito?: unknown;
}

interface TrilliumRewardItem {
  icon_url?: unknown;
  vote_account_pubkey?: unknown;
}

const PROFILE_FIELDS: ValidatorProfileField[] = [
  "name",
  "description",
  "logoUrl",
  "estimatedApyPercent",
  "commissionPercent",
  "mevCommissionPercent",
  "mevEnabled",
];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nullableString(value: unknown, field = "value"): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new Error(`Invalid ${field}`);
  return value.trim() ? value : null;
}

function nullableNumber(value: unknown, field = "value"): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid ${field}`);
  }
  return value;
}

function nullableBoolean(value: unknown, field = "value"): boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "boolean") throw new Error(`Invalid ${field}`);
  return value;
}

function emptyFields(): ValidatorProfile["fields"] {
  return Object.fromEntries(
    PROFILE_FIELDS.map((field) => [
      field,
      { source: null, observedAt: null, stale: false },
    ])
  ) as ValidatorProfile["fields"];
}

export function createUnavailableValidatorProfile(
  voteAccount: string,
  network: NetworkType
): ValidatorProfile {
  return {
    network,
    voteAccount,
    name: null,
    description: null,
    logoUrl: null,
    estimatedApyPercent: null,
    commissionPercent: null,
    mevCommissionPercent: null,
    mevEnabled: null,
    status: "unavailable",
    fields: emptyFields(),
  };
}

function parseFieldMetadata(
  value: unknown,
  field: ValidatorProfileField
): ValidatorFieldMetadata {
  const data = asRecord(value);
  if (!data || typeof data.stale !== "boolean") {
    throw new Error(`Invalid fields.${field}`);
  }
  return {
    source: nullableString(data.source, `fields.${field}.source`),
    observedAt: nullableString(data.observedAt, `fields.${field}.observedAt`),
    stale: data.stale,
  };
}

function parseBackendLogo(
  value: unknown,
  voteAccount: string,
  network: NetworkType
): ValidatorLogo {
  const data = asRecord(value);
  if (!data || data.voteAccount !== voteAccount || data.network !== network) {
    throw new Error("Validator logo response does not match the request");
  }
  if (
    data.status !== "fresh" &&
    data.status !== "stale" &&
    data.status !== "unavailable"
  ) {
    throw new Error("Invalid validator logo status");
  }
  return {
    network,
    voteAccount,
    logoUrl: nullableString(data.logoUrl, "logoUrl"),
    status: data.status,
    field: parseFieldMetadata(data.field, "logoUrl"),
  };
}

function parseBackendProfile(
  value: unknown,
  voteAccount: string,
  network: NetworkType
): ValidatorProfile {
  const data = asRecord(value);
  if (!data || data.voteAccount !== voteAccount || data.network !== network) {
    throw new Error("Validator profile response does not match the request");
  }
  if (
    data.status !== "fresh" &&
    data.status !== "partial" &&
    data.status !== "stale" &&
    data.status !== "unavailable"
  ) {
    throw new Error("Invalid validator profile status");
  }
  const rawFields = asRecord(data.fields);
  if (!rawFields) throw new Error("Invalid validator profile fields");

  return {
    network,
    voteAccount,
    name: nullableString(data.name, "name"),
    description: nullableString(data.description, "description"),
    logoUrl: nullableString(data.logoUrl, "logoUrl"),
    estimatedApyPercent: nullableNumber(
      data.estimatedApyPercent,
      "estimatedApyPercent"
    ),
    commissionPercent: nullableNumber(data.commissionPercent, "commissionPercent"),
    mevCommissionPercent: nullableNumber(
      data.mevCommissionPercent,
      "mevCommissionPercent"
    ),
    mevEnabled: nullableBoolean(data.mevEnabled, "mevEnabled"),
    status: data.status,
    fields: Object.fromEntries(
      PROFILE_FIELDS.map((field) => [
        field,
        parseFieldMetadata(rawFields[field], field),
      ])
    ) as ValidatorProfile["fields"],
  };
}

function legacyMetadata(source: string): ValidatorFieldMetadata {
  return { source, observedAt: new Date().toISOString(), stale: false };
}

async function fetchLegacyValidatorInfo(
  voteAccount: string,
  network: NetworkType
): Promise<ValidatorProfile> {
  const response = await fetch(`${VALIDATOR_INFO_URL}/${voteAccount}`);
  if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

  const data = (await response.json()) as LegacyStakewizResponse;
  const mevCommissionBps = nullableNumber(
    data.jito_commission_bps,
    "jito_commission_bps"
  );
  const profile = createUnavailableValidatorProfile(voteAccount, network);
  profile.name = nullableString(data.name, "name");
  profile.description = nullableString(data.description, "description");
  profile.estimatedApyPercent = nullableNumber(data.total_apy, "total_apy");
  profile.commissionPercent = nullableNumber(data.commission, "commission");
  profile.mevCommissionPercent =
    mevCommissionBps === null ? null : mevCommissionBps / 100;
  profile.mevEnabled = nullableBoolean(data.is_jito, "is_jito");
  profile.status = "partial";

  for (const field of PROFILE_FIELDS) {
    if (profile[field] !== null) profile.fields[field] = legacyMetadata("stakewiz");
  }
  return profile;
}

async function fetchLegacyValidatorLogo(voteAccount: string): Promise<string | null> {
  const data = await fetchBackendJson<TrilliumRewardItem[]>(
    "/trillium/rewards?validatorIdentity=" + encodeURIComponent(voteAccount)
  );
  if (!Array.isArray(data)) return null;
  const match = data.find((item) => item.vote_account_pubkey === voteAccount);
  return nullableString(match?.icon_url, "icon_url");
}

async function fetchLegacyValidatorProfile(
  voteAccount: string,
  network: NetworkType
): Promise<ValidatorProfile> {
  const [info, logo] = await Promise.allSettled([
    fetchLegacyValidatorInfo(voteAccount, network),
    fetchLegacyValidatorLogo(voteAccount),
  ]);
  if (info.status === "rejected" && logo.status === "rejected") throw info.reason;

  const profile =
    info.status === "fulfilled"
      ? info.value
      : createUnavailableValidatorProfile(voteAccount, network);
  if (logo.status === "fulfilled" && logo.value) {
    profile.logoUrl = logo.value;
    profile.fields.logoUrl = legacyMetadata("trillium");
    if (profile.status === "unavailable") profile.status = "partial";
  }
  return profile;
}

export function isLegacyValidatorProfileEnabled(): boolean {
  return TRUE_VALUES.has(
    (import.meta.env.VITE_USE_LEGACY_VALIDATOR_PROFILE || "").toLowerCase()
  );
}

export async function fetchValidatorProfile(
  voteAccount: string,
  network: NetworkType
): Promise<ValidatorProfile> {
  if (isLegacyValidatorProfileEnabled()) {
    return fetchLegacyValidatorProfile(voteAccount, network);
  }

  const query = new URLSearchParams({ network, voteAccount });
  const data = await fetchBackendJson<unknown>(
    "/validator/profile?" + query.toString()
  );
  return parseBackendProfile(data, voteAccount, network);
}

export async function fetchValidatorLogo(
  voteAccount: string,
  network: NetworkType
): Promise<ValidatorLogo> {
  const query = new URLSearchParams({ network, voteAccount });
  const data = await fetchBackendJson<unknown>(
    "/validator/logo?" + query.toString()
  );
  return parseBackendLogo(data, voteAccount, network);
}

export function applyValidatorLogo(
  profile: ValidatorProfile,
  logo: ValidatorLogo | null
): ValidatorProfile {
  if (
    !logo ||
    logo.network !== profile.network ||
    logo.voteAccount !== profile.voteAccount ||
    profile.fields.logoUrl.source === "widget-option"
  ) {
    return profile;
  }
  return {
    ...profile,
    logoUrl: logo.logoUrl,
    fields: {
      ...profile.fields,
      logoUrl: logo.field,
    },
  };
}

export function applyValidatorOverrides(
  profile: ValidatorProfile,
  options: Pick<
    Options,
    "validator_name" | "validator_description" | "validator_logo_url"
  > | null
): ValidatorProfile {
  if (!options) return profile;

  const overrides: Partial<Record<ValidatorProfileField, string | null>> = {
    name: nullableString(options.validator_name, "validator_name"),
    description: nullableString(
      options.validator_description,
      "validator_description"
    ),
    logoUrl: nullableString(options.validator_logo_url, "validator_logo_url"),
  };
  let applied = false;
  const next = { ...profile, fields: { ...profile.fields } };

  for (const field of ["name", "description", "logoUrl"] as const) {
    const value = overrides[field];
    if (value) {
      next[field] = value;
      next.fields[field] = {
        source: "widget-option",
        observedAt: null,
        stale: false,
      };
      applied = true;
    }
  }
  if (applied && next.status === "unavailable") next.status = "partial";
  return next;
}
