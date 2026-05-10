const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

const apiBaseURL = import.meta.env.VITE_BACKEND_URL || "";
const disableBackendPrefix = TRUE_VALUES.has(
  (import.meta.env.DISABLE_BACKEND_PREFIX || "").toLowerCase()
);

const backendPrefix = disableBackendPrefix ? "" : "/api";

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function ensureLeadingSlash(value: string): string {
  return value.startsWith("/") ? value : `/${value}`;
}

export function getBackendPath(path: string): string {
  return `${backendPrefix}${ensureLeadingSlash(path)}`;
}

export function getBackendUrl(path: string): string {
  return `${trimTrailingSlash(apiBaseURL)}${getBackendPath(path)}`;
}
