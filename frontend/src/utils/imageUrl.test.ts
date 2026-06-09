import { describe, expect, it, vi } from "vitest";

async function loadImageUrl(env: Record<string, string | undefined> = {}) {
  vi.resetModules();
  vi.unstubAllEnvs();
  for (const [key, value] of Object.entries(env)) {
    vi.stubEnv(key, value);
  }
  return import("./imageUrl");
}

describe("image URL helpers", () => {
  it("returns local image paths unchanged without a prefix", async () => {
    const { getImageUrl } = await loadImageUrl();

    expect(getImageUrl("/images/sol_logo.png")).toBe("/images/sol_logo.png");
  });

  it("prefixes local widget images", async () => {
    const { cssImageUrl, getImageUrl } = await loadImageUrl({
      IMAGE_URL_PREFIX: "https://cdn.example/api/images/",
    });

    expect(getImageUrl("/images/sol_logo.png")).toBe(
      "https://cdn.example/api/images/images/sol_logo.png"
    );
    expect(cssImageUrl("/images/sol_logo.png")).toBe(
      'url("https://cdn.example/api/images/images/sol_logo.png")'
    );
  });

  it("does not rewrite external URLs or non-image paths", async () => {
    const { getImageUrl } = await loadImageUrl({
      IMAGE_URL_PREFIX: "https://cdn.example",
    });

    expect(getImageUrl("https://assets.example/logo.png")).toBe(
      "https://assets.example/logo.png"
    );
    expect(getImageUrl("data:image/png;base64,abc")).toBe(
      "data:image/png;base64,abc"
    );
    expect(getImageUrl("/favicon.ico")).toBe("/favicon.ico");
  });
});
