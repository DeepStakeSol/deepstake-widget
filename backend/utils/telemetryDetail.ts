import { createHash } from "node:crypto";

import {
  getTelemetryStats,
  parseTelemetryPayload,
  TELEMETRY_REGISTRY_KEYS,
  type DetailedTelemetryStats,
  type TelemetryHost,
  type TelemetryRedisClient
} from "./telemetry";

const DETAIL_SCRIPT = [
  "local result = {}",
  "for i = 1, 30 do",
  "  table.insert(result, redis.call('SMEMBERS', KEYS[i]))",
  "end",
  "for i = 31, 33 do",
  "  table.insert(result, redis.call('HGETALL', KEYS[i]))",
  "end",
  "return result"
].join("\n");

function utcDay(date: Date, daysAgo: number): string {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() - daysAgo
    )
  )
    .toISOString()
    .slice(0, 10);
}

function normalizeHost(value: string): string | null {
  const host = value.trim().toLowerCase().replace(/\.+$/, "");
  if (!host || host.length > 253) return null;
  if (
    host
      .split(".")
      .some(
        (part) =>
          !part ||
          part.length > 63 ||
          !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(part)
      )
  )
    return null;
  return host;
}

export function isDevelopmentHost(
  hostname: string,
  ownHosts = process.env.TELEMETRY_OWN_HOSTS
): boolean {
  const host = normalizeHost(hostname);
  if (!host) return false;
  if (host === "localhost" || host.endsWith(".local")) return true;

  const octets = host.split(".");
  if (
    octets.length === 4 &&
    octets.every((octet) => /^\d{1,3}$/.test(octet) && Number(octet) <= 255)
  ) {
    const first = Number(octets[0]);
    const second = Number(octets[1]);
    if (
      first === 127 ||
      first === 10 ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 169 && second === 254)
    )
      return true;
  }

  return (ownHosts?.trim() || "deepstake.info").split(",").some((name) => {
    const own = normalizeHost(name);
    return own !== null && (host === own || host.endsWith("." + own));
  });
}

function validDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(value + "T00:00:00.000Z");
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

function hashEntries(value: unknown): Map<string, string> {
  const entries = new Map<string, string>();
  if (!Array.isArray(value) || value.length % 2 !== 0) return entries;
  for (let i = 0; i < value.length; i += 2) {
    if (typeof value[i] === "string" && typeof value[i + 1] === "string") {
      entries.set(value[i], value[i + 1]);
    }
  }
  return entries;
}

export async function getDetailedTelemetryStats(
  client: TelemetryRedisClient,
  now = new Date()
): Promise<DetailedTelemetryStats> {
  const base = await getTelemetryStats(client, now);
  const days = Array.from({ length: 30 }, (_, i) => utcDay(now, i));
  const raw = await client.eval(DETAIL_SCRIPT, {
    keys: [
      ...days.map((day) => "telemetry:v1:" + day + ":hosts"),
      ...TELEMETRY_REGISTRY_KEYS
    ],
    arguments: []
  });
  if (!Array.isArray(raw) || raw.length !== 33) {
    throw new Error("Invalid telemetry detail returned by Redis");
  }

  const firstSeen = hashEntries(raw[30]);
  const lastSeen = hashEntries(raw[31]);
  const lastEvent = hashEntries(raw[32]);
  const hosts: TelemetryHost[] = [];
  for (const [field, json] of lastEvent) {
    const first = firstSeen.get(field);
    const last = lastSeen.get(field);
    if (!validDay(first) || !validDay(last) || first > last) continue;
    try {
      const parsed = parseTelemetryPayload(JSON.parse(json));
      const expected = createHash("sha256")
        .update(parsed.hostname)
        .update("\0")
        .update(parsed.vote_account)
        .digest("hex");
      if (field !== expected) continue;
      const { event: _event, ...fields } = parsed;
      hosts.push({
        ...fields,
        first_seen: first,
        last_seen: last,
        is_dev: isDevelopmentHost(parsed.hostname)
      });
    } catch {
      // Corrupt registry values are omitted from the response.
    }
  }
  const compare = (left: string, right: string) =>
    left < right ? -1 : left > right ? 1 : 0;
  hosts.sort(
    (a, b) =>
      compare(b.last_seen, a.last_seen) ||
      compare(a.hostname, b.hostname) ||
      compare(a.vote_account, b.vote_account)
  );

  const external = new Set<string>();
  const externalCounts: number[] = [];
  for (let i = 0; i < 30; i++) {
    if (!Array.isArray(raw[i])) {
      throw new Error("Invalid daily hosts returned by Redis");
    }
    for (const item of raw[i] as unknown[]) {
      if (typeof item !== "string") continue;
      const host = normalizeHost(item);
      if (host && !isDevelopmentHost(host)) external.add(host);
    }
    if (i === 0 || i === 6 || i === 29) externalCounts.push(external.size);
  }

  return {
    windows: {
      "1d": { ...base.windows["1d"], unique_hosts_external: externalCounts[0] },
      "7d": { ...base.windows["7d"], unique_hosts_external: externalCounts[1] },
      "30d": {
        ...base.windows["30d"],
        unique_hosts_external: externalCounts[2]
      }
    },
    hosts: hosts.slice(0, 1000)
  };
}
