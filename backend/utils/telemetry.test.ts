import { describe, expect, it, vi } from "vitest";

import {
  getTelemetryStats,
  parseTelemetryPayload,
  parseTelemetryRequest,
  recordWidgetMount,
  TELEMETRY_BODY_LIMIT_BYTES,
  TelemetryRequestError,
  type TelemetryRedisClient,
  type WidgetMountEvent
} from "./telemetry";

const voteAccount = "Vote111111111111111111111111111111111111111";
const event: WidgetMountEvent = {
  event: "widget_mount",
  hostname: "validator.example",
  vote_account: voteAccount,
  network: "devnet",
  tabs: ["native", "blaze"],
  theme: "dark",
  version: "1.2.3"
};

describe("telemetry validation", () => {
  it("normalizes the accepted fields", () => {
    expect(
      parseTelemetryPayload({
        ...event,
        hostname: " Validator.Example. ",
        vote_account: ` ${voteAccount} `,
        version: " 1.2.3 "
      })
    ).toEqual(event);
  });

  it.each([
    ["event", { ...event, event: "click" }],
    ["hostname", { ...event, hostname: "https://validator.example/path" }],
    ["vote account", { ...event, vote_account: "not-base58" }],
    ["network", { ...event, network: "testnet" }],
    ["theme", { ...event, theme: "sepia" }],
    ["tabs", { ...event, tabs: ["native", "native"] }],
    ["version", { ...event, version: "bad version" }],
    ["unknown fields", { ...event, wallet: "must-not-be-stored" }]
  ])("rejects an invalid %s", (_label, payload) => {
    expect(() => parseTelemetryPayload(payload)).toThrow(TelemetryRequestError);
  });

  it("accepts text and JSON content types and rejects oversized bodies", async () => {
    const textRequest = new Request("http://localhost/api/telemetry", {
      method: "POST",
      body: JSON.stringify(event)
    });
    await expect(parseTelemetryRequest(textRequest)).resolves.toEqual(event);

    const jsonRequest = new Request("http://localhost/api/telemetry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event)
    });
    await expect(parseTelemetryRequest(jsonRequest)).resolves.toEqual(event);

    const oversized = new Request("http://localhost/api/telemetry", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "x".repeat(TELEMETRY_BODY_LIMIT_BYTES + 1)
    });
    await expect(parseTelemetryRequest(oversized)).rejects.toMatchObject({
      status: 413
    });
  });
});

describe("telemetry Redis aggregation", () => {
  it("uses one atomic daily operation for deduplication, sets, and expiry", async () => {
    const seen = new Set<string>();
    const evalMock = vi.fn(
      async (
        script: string,
        options: {
          keys: string[];
          arguments: string[];
        }
      ) => {
        expect(script).toContain("HSETNX");
        expect(script).toContain("SADD");
        expect(script).toContain("EXPIREAT");
        const deduplicationKey = options.arguments[0];
        if (seen.has(deduplicationKey)) return 0;
        seen.add(deduplicationKey);
        return 1;
      }
    );
    const client = { eval: evalMock } as TelemetryRedisClient;
    const now = new Date("2026-09-18T12:30:00.000Z");

    await expect(recordWidgetMount(client, event, now)).resolves.toBe(true);
    await expect(recordWidgetMount(client, event, now)).resolves.toBe(false);

    expect(seen).toHaveLength(1);
    expect(evalMock).toHaveBeenCalledTimes(2);
    const [, options] = evalMock.mock.calls[0];
    expect(options.keys).toEqual([
      "telemetry:v1:2026-09-18:events",
      "telemetry:v1:2026-09-18:hosts",
      "telemetry:v1:2026-09-18:vote-accounts"
    ]);
    expect(JSON.parse(options.arguments[1])).toEqual(event);
    expect(options.arguments.slice(2, 4)).toEqual([
      event.hostname,
      event.vote_account
    ]);
    expect(Number(options.arguments[4])).toBe(
      Date.parse("2026-10-20T00:00:00.000Z") / 1000
    );
  });

  it("builds rolling UTC windows from one Redis snapshot", async () => {
    const evalMock = vi.fn().mockResolvedValue([2, 1, 2, 10, 4, 6, 50, 12, 20]);
    const client = { eval: evalMock } as TelemetryRedisClient;

    await expect(
      getTelemetryStats(client, new Date("2026-09-18T23:59:59.000Z"))
    ).resolves.toEqual({
      windows: {
        "1d": {
          start_date: "2026-09-18",
          end_date: "2026-09-18",
          deduplicated_mounts: 2,
          unique_hosts: 1,
          unique_vote_accounts: 2
        },
        "7d": {
          start_date: "2026-09-12",
          end_date: "2026-09-18",
          deduplicated_mounts: 10,
          unique_hosts: 4,
          unique_vote_accounts: 6
        },
        "30d": {
          start_date: "2026-08-20",
          end_date: "2026-09-18",
          deduplicated_mounts: 50,
          unique_hosts: 12,
          unique_vote_accounts: 20
        }
      }
    });

    const [, options] = evalMock.mock.calls[0];
    expect(options.keys).toHaveLength(90);
    expect(options.keys[0]).toBe("telemetry:v1:2026-09-18:events");
    expect(options.keys[29]).toBe("telemetry:v1:2026-08-20:events");
  });
});
