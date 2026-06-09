import { describe, expect, it, vi } from "vitest";

async function loadBackendUrl(env: Record<string, string | undefined> = {}) {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.stubEnv("VITE_BACKEND_URL", "");
  vi.stubEnv("DISABLE_BACKEND_PREFIX", "");
  for (const [key, value] of Object.entries(env)) {
    vi.stubEnv(key, value);
  }
  return import("./backendUrl");
}

describe("backend URL helpers", () => {
  it("adds the /api prefix by default", async () => {
    const { getBackendPath, getBackendUrl } = await loadBackendUrl();

    expect(getBackendPath("stake/fetch")).toBe("/api/stake/fetch");
    expect(getBackendUrl("stake/fetch")).toBe("/api/stake/fetch");
  });

  it("joins a configured backend URL without duplicate slashes", async () => {
    const { getBackendUrl } = await loadBackendUrl({
      VITE_BACKEND_URL: "https://backend.example/",
    });

    expect(getBackendUrl("/balance?address=abc")).toBe(
      "https://backend.example/api/balance?address=abc"
    );
  });

  it("can disable the backend prefix for deployments that already map /api", async () => {
    const { getBackendPath, getBackendUrl } = await loadBackendUrl({
      VITE_BACKEND_URL: "https://backend.example/api",
      DISABLE_BACKEND_PREFIX: "true",
    });

    expect(getBackendPath("stake/fetch")).toBe("/stake/fetch");
    expect(getBackendUrl("stake/fetch")).toBe(
      "https://backend.example/api/stake/fetch"
    );
  });
});
