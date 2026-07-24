import { describe, expect, it, vi } from "vitest";

import { operationalLog } from "./logger";

describe("operationalLog", () => {
  it("writes parseable single-line JSON and sanitizes error text", () => {
    const warning = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    operationalLog("warn", "provider_failed", {
      provider: "stakewiz",
      error: "first line\nhttps://provider.test?token=secret Bearer token-value"
    });

    expect(warning).toHaveBeenCalledTimes(1);
    const message = warning.mock.calls[0][0] as string;
    expect(message).not.toContain("\n");
    expect(JSON.parse(message)).toMatchObject({
      level: "warn",
      event: "provider_failed",
      provider: "stakewiz",
      error: "first line [redacted-url] Bearer [redacted]"
    });
  });
});
