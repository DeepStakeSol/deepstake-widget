import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  recordWidgetMount,
  type TelemetryRedisClient,
  type WidgetMountEvent
} from "./telemetry";
import {
  getDetailedTelemetryStats,
  isDevelopmentHost
} from "./telemetryDetail";

const vote = "Vote111111111111111111111111111111111111111";
const event: WidgetMountEvent = {
  event: "widget_mount",
  hostname: "alpha.example",
  vote_account: vote,
  network: "mainnet",
  tabs: ["native"],
  theme: "light",
  version: "1.0.0"
};

function fieldFor(item: WidgetMountEvent): string {
  return createHash("sha256")
    .update(item.hostname)
    .update("\0")
    .update(item.vote_account)
    .digest("hex");
}

class TimeAwareRedis {
  now = Date.parse("2026-09-18T12:00:00Z") / 1000;
  hashes = new Map<string, Map<string, string>>();
  sets = new Map<string, Set<string>>();
  expiry = new Map<string, number>();

  hash(key: string): Map<string, string> {
    if (!this.hashes.has(key)) this.hashes.set(key, new Map());
    return this.hashes.get(key)!;
  }

  expire(key: string): void {
    if ((this.expiry.get(key) ?? Infinity) <= this.now) {
      this.hashes.delete(key);
      this.sets.delete(key);
      this.expiry.delete(key);
    }
  }

  readHash(key: string): Map<string, string> {
    this.expire(key);
    return this.hashes.get(key) ?? new Map();
  }

  readSet(key: string): Set<string> {
    this.expire(key);
    return this.sets.get(key) ?? new Set();
  }

  async eval(
    _script: string,
    options: { keys: string[]; arguments: string[] }
  ) {
    const [daily, hosts, votes, first, last, latest] = options.keys;
    const [field, json, host, voteAccount, expires, day] = options.arguments;
    if (this.readHash(daily).has(field)) return 0;
    this.hash(daily).set(field, json);
    if (!this.sets.has(hosts)) this.sets.set(hosts, new Set());
    if (!this.sets.has(votes)) this.sets.set(votes, new Set());
    this.sets.get(hosts)!.add(host);
    this.sets.get(votes)!.add(voteAccount);
    for (const key of [daily, hosts, votes])
      this.expiry.set(key, Number(expires));
    if (!this.hash(first).has(field)) this.hash(first).set(field, day);
    this.hash(last).set(field, day);
    this.hash(latest).set(field, json);
    return 1;
  }
}

describe("persistent telemetry registry", () => {
  it("preserves the first day, ignores same-day changes, and retains records after daily expiry", async () => {
    const redis = new TimeAwareRedis();
    const client = redis as TelemetryRedisClient;
    const first = "telemetry:v1:registry:first_seen";
    const last = "telemetry:v1:registry:last_seen";
    const latest = "telemetry:v1:registry:last_event";
    const field = fieldFor(event);

    expect(
      await recordWidgetMount(client, event, new Date("2026-09-18T12:00:00Z"))
    ).toBe(true);
    expect(redis.hash(first).get(field)).toBe("2026-09-18");
    expect(redis.hash(last).get(field)).toBe("2026-09-18");
    expect(JSON.parse(redis.hash(latest).get(field)!)).toEqual(event);
    const changed = { ...event, theme: "dark" as const };
    expect(
      await recordWidgetMount(client, changed, new Date("2026-09-18T18:00:00Z"))
    ).toBe(false);
    expect(redis.hash(last).get(field)).toBe("2026-09-18");
    expect(JSON.parse(redis.hash(latest).get(field)!)).toEqual(event);

    redis.now = Date.parse("2026-09-19T12:00:00Z") / 1000;
    expect(
      await recordWidgetMount(client, changed, new Date("2026-09-19T12:00:00Z"))
    ).toBe(true);
    expect(redis.hash(first).get(field)).toBe("2026-09-18");
    expect(redis.hash(last).get(field)).toBe("2026-09-19");
    expect(JSON.parse(redis.hash(latest).get(field)!)).toEqual(changed);

    redis.now = Date.parse("2026-10-21T00:00:00Z") / 1000;
    expect(redis.readHash("telemetry:v1:2026-09-18:events").size).toBe(0);
    expect(redis.readHash("telemetry:v1:2026-09-19:events").size).toBe(0);
    expect(redis.readSet("telemetry:v1:2026-09-18:hosts").size).toBe(0);
    expect(redis.readSet("telemetry:v1:2026-09-19:vote-accounts").size).toBe(0);
    expect(redis.hash(first).get(field)).toBe("2026-09-18");
    expect(redis.hash(last).get(field)).toBe("2026-09-19");
    expect(redis.expiry.has(first)).toBe(false);
    expect(redis.expiry.has(last)).toBe(false);
    expect(redis.expiry.has(latest)).toBe(false);
  });
});

function flatten(map: Map<string, string>): string[] {
  return [...map].flat();
}

function detailedClient(
  daily: string[][],
  entries: Array<{ item: WidgetMountEvent; first: string; last: string }>,
  corrupt: [string[], string[], string[]] = [[], [], []]
): TelemetryRedisClient {
  const first = new Map<string, string>();
  const last = new Map<string, string>();
  const latest = new Map<string, string>();
  for (const entry of entries) {
    const field = fieldFor(entry.item);
    first.set(field, entry.first);
    last.set(field, entry.last);
    latest.set(field, JSON.stringify(entry.item));
  }
  const raw = [
    ...daily,
    [...flatten(first), ...corrupt[0]],
    [...flatten(last), ...corrupt[1]],
    [...flatten(latest), ...corrupt[2]]
  ];
  return {
    eval: vi.fn(async (_script, options) =>
      options.keys.length === 90 ? [1, 1, 1, 7, 4, 2, 30, 8, 3] : raw
    )
  };
}

describe("detailed telemetry", () => {
  it("counts distinct external hosts separately for each rolling window", async () => {
    const daily = Array.from({ length: 30 }, () => [] as string[]);
    daily[0] = ["alpha.example", "LOCALHOST", "deepstake.info."];
    daily[1] = ["alpha.example", "beta.example"];
    daily[7] = ["gamma.example", "10.0.0.1"];
    const stats = await getDetailedTelemetryStats(
      detailedClient(daily, [
        { item: event, first: "2026-09-18", last: "2026-09-18" }
      ]),
      new Date("2026-09-18T12:00:00Z")
    );
    expect([
      stats.windows["1d"].unique_hosts_external,
      stats.windows["7d"].unique_hosts_external,
      stats.windows["30d"].unique_hosts_external
    ]).toEqual([1, 2, 3]);
    expect(stats.hosts).toEqual([
      {
        hostname: "alpha.example",
        vote_account: vote,
        network: "mainnet",
        tabs: ["native"],
        theme: "light",
        version: "1.0.0",
        first_seen: "2026-09-18",
        last_seen: "2026-09-18",
        is_dev: false
      }
    ]);
  });

  it("drops malformed registry records and sorts before limiting to 1000", async () => {
    const entries = Array.from({ length: 1001 }, (_, i) => ({
      item: {
        ...event,
        hostname: "host" + String(i).padStart(4, "0") + ".example"
      },
      first: "2026-09-01",
      last: i === 1000 ? "2026-09-18" : "2026-09-17"
    }));
    const invalid = fieldFor({ ...event, hostname: "invalid.example" });
    const stats = await getDetailedTelemetryStats(
      detailedClient(
        Array.from({ length: 30 }, () => []),
        entries,
        [
          [invalid, "2026-02-30"],
          [invalid, "2026-09-18"],
          [invalid, JSON.stringify({ ...event, hostname: "invalid.example" })]
        ]
      ),
      new Date("2026-09-18T12:00:00Z")
    );
    expect(stats.hosts).toHaveLength(1000);
    expect(stats.hosts[0].hostname).toBe("host1000.example");
    expect(stats.hosts[1].hostname).toBe("host0000.example");
    expect(stats.hosts.at(-1)?.hostname).toBe("host0998.example");
    expect(
      stats.hosts.some((host) => host.hostname === "invalid.example")
    ).toBe(false);
  });

  it.each([
    ["localhost", true],
    ["LOCALHOST.", true],
    ["127.0.0.0", true],
    ["127.255.255.255", true],
    ["126.255.255.255", false],
    ["128.0.0.0", false],
    ["10.0.0.0", true],
    ["10.255.255.255", true],
    ["172.15.255.255", false],
    ["172.16.0.0", true],
    ["172.31.255.255", true],
    ["172.32.0.0", false],
    ["192.168.0.0", true],
    ["192.168.255.255", true],
    ["192.169.0.0", false],
    ["169.254.0.0", true],
    ["169.254.255.255", true],
    ["169.255.0.0", false],
    ["127.0.0.256", false],
    ["127.000.000.001", true],
    ["dev.local", true],
    ["deepstake.info", true],
    ["ABC.DeepStake.Info.", true],
    ["notdeepstake.info", false],
    ["deepstake.info.evil", false],
    ["sub.own.example.", true]
  ])("classifies %s", (host, expected) => {
    expect(
      isDevelopmentHost(host as string, " DeepStake.Info. , OWN.EXAMPLE. ")
    ).toBe(expected);
  });

  it("reclassifies existing registry entries when own hosts change", async () => {
    const client = detailedClient(
      Array.from({ length: 30 }, () => []),
      [{ item: event, first: "2026-09-01", last: "2026-09-18" }]
    );
    const now = new Date("2026-09-18T12:00:00Z");
    try {
      vi.stubEnv("TELEMETRY_OWN_HOSTS", "another.example");
      expect(
        (await getDetailedTelemetryStats(client, now)).hosts[0].is_dev
      ).toBe(false);
      vi.stubEnv("TELEMETRY_OWN_HOSTS", "alpha.example");
      expect(
        (await getDetailedTelemetryStats(client, now)).hosts[0].is_dev
      ).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("uses the default own domain", () => {
    expect(isDevelopmentHost("www.deepstake.info", undefined)).toBe(true);
  });
});
