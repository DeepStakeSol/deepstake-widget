import { validatorProfileProviders } from "./providers";
import {
  VALIDATOR_PROFILE_FIELDS,
  type FieldMetadata,
  type ProviderResult,
  type ValidatorNetwork,
  type ValidatorProfile,
  type ValidatorProfileField,
  type ValidatorProfileProvider,
  type ValidatorProfileValues,
} from "./types";

const AGGREGATION_TIMEOUT_MS = 3_000;

const FIELD_PRECEDENCE: Record<ValidatorProfileField, string[]> = {
  name: ["stakewiz", "validators-app"],
  description: ["stakewiz", "validators-app"],
  logoUrl: ["stakewiz", "trillium", "validators-app"],
  estimatedApyPercent: ["stakewiz"],
  commissionPercent: ["solana-rpc", "stakewiz", "validators-app"],
  mevCommissionPercent: ["jito", "stakewiz"],
  mevEnabled: ["jito", "stakewiz"],
};

function emptyValues(): ValidatorProfileValues {
  return {
    name: null,
    description: null,
    logoUrl: null,
    estimatedApyPercent: null,
    commissionPercent: null,
    mevCommissionPercent: null,
    mevEnabled: null,
  };
}

function emptyFields(): ValidatorProfile["fields"] {
  return Object.fromEntries(
    VALIDATOR_PROFILE_FIELDS.map((field) => [
      field,
      { source: null, observedAt: null, stale: false } satisfies FieldMetadata,
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
          stale: false,
        };
        break;
      }
    }
  }

  return { values, fields };
}

function profileStatus(values: ValidatorProfileValues): ValidatorProfile["status"] {
  const hasAnyValue = VALIDATOR_PROFILE_FIELDS.some(
    (field) => values[field] !== null
  );
  if (!hasAnyValue) return "unavailable";

  const coreComplete =
    values.name !== null &&
    values.estimatedApyPercent !== null &&
    values.commissionPercent !== null &&
    values.mevEnabled !== null &&
    (values.mevEnabled === false || values.mevCommissionPercent !== null);
  return coreComplete ? "fresh" : "partial";
}

export async function getValidatorProfile(
  network: ValidatorNetwork,
  voteAccount: string,
  providers: ValidatorProfileProvider[] = validatorProfileProviders,
  timeoutMs = AGGREGATION_TIMEOUT_MS
): Promise<ValidatorProfile> {
  const controller = new AbortController();
  const results: ProviderResult[] = [];
  let deadline: ReturnType<typeof setTimeout> | undefined;

  const requests = providers.map(async (provider) => {
    try {
      const providerResult = await provider({
        network,
        voteAccount,
        signal: controller.signal,
      });
      if (providerResult) results.push(providerResult);
    } catch (error) {
      console.warn("Validator profile provider failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  await Promise.race([
    Promise.allSettled(requests),
    new Promise<void>((resolve) => {
      deadline = setTimeout(resolve, timeoutMs);
    }),
  ]);
  if (deadline) clearTimeout(deadline);
  controller.abort(new Error("Validator profile aggregation deadline reached"));

  const { values, fields } = mergeResults(results);
  return {
    network,
    voteAccount,
    ...values,
    status: profileStatus(values),
    fields,
  };
}
