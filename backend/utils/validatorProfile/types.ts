export type ValidatorNetwork = "mainnet" | "devnet";

export const VALIDATOR_PROFILE_FIELDS = [
  "name",
  "description",
  "logoUrl",
  "estimatedApyPercent",
  "commissionPercent",
  "mevCommissionPercent",
  "mevEnabled",
] as const;

export type ValidatorProfileField = (typeof VALIDATOR_PROFILE_FIELDS)[number];

export interface FieldMetadata {
  source: string | null;
  observedAt: string | null;
  stale: boolean;
}

export interface ValidatorProfile {
  network: ValidatorNetwork;
  voteAccount: string;
  name: string | null;
  description: string | null;
  logoUrl: string | null;
  estimatedApyPercent: number | null;
  commissionPercent: number | null;
  mevCommissionPercent: number | null;
  mevEnabled: boolean | null;
  status: "fresh" | "partial" | "stale" | "unavailable";
  fields: Record<ValidatorProfileField, FieldMetadata>;
}

export type ValidatorProfileValues = Pick<ValidatorProfile, ValidatorProfileField>;

export interface ProviderResult {
  source: string;
  observedAt: string;
  values: Partial<ValidatorProfileValues>;
}

export interface ProviderContext {
  network: ValidatorNetwork;
  voteAccount: string;
  signal: AbortSignal;
}

export type ValidatorProfileProvider = (
  context: ProviderContext
) => Promise<ProviderResult | null>;

export interface ValidatorProfileProviderConfig {
  id: string;
  timeoutMs: number;
  provider: ValidatorProfileProvider;
  baseline?: boolean;
}
