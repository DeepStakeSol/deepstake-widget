import { createHash } from "node:crypto";

import { address } from "@solana/kit";

export const TELEMETRY_BODY_LIMIT_BYTES = 4 * 1024;
export const TELEMETRY_RETENTION_DAYS = 32;

const TELEMETRY_PREFIX = "telemetry:v1";
const VALID_TABS = new Set(["native", "blaze", "vault"]);
const ALLOWED_FIELDS = new Set([
  "event",
  "hostname",
  "vote_account",
  "network",
  "tabs",
  "theme",
  "version"
]);

export type TelemetryTab = "native" | "blaze" | "vault";

export type WidgetMountEvent = {
  event: "widget_mount";
  hostname: string;
  vote_account: string;
  network: "mainnet" | "devnet";
  tabs: TelemetryTab[];
  theme: "light" | "dark";
  version: string;
};

export type TelemetryWindow = {
  start_date: string;
  end_date: string;
  deduplicated_mounts: number;
  unique_hosts: number;
  unique_vote_accounts: number;
};

export type TelemetryStats = {
  windows: {
    "1d": TelemetryWindow;
    "7d": TelemetryWindow;
    "30d": TelemetryWindow;
  };
};

export type TelemetryHost = Omit<WidgetMountEvent, "event"> & {
  first_seen: string;
  last_seen: string;
  is_dev: boolean;
};

export type DetailedTelemetryStats = {
  windows: {
    "1d": TelemetryWindow & { unique_hosts_external: number };
    "7d": TelemetryWindow & { unique_hosts_external: number };
    "30d": TelemetryWindow & { unique_hosts_external: number };
  };
  hosts: TelemetryHost[];
};

export interface TelemetryRedisClient {
  eval(
    script: string,
    options: { keys: string[]; arguments: string[] }
  ): Promise<unknown>;
}

export class TelemetryRequestError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 413 | 415
  ) {
    super(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeHostname(value: string): string | null {
  const hostname = value.trim().toLowerCase().replace(/\.$/, "");
  if (!hostname || hostname.length > 253) return null;

  const labels = hostname.split(".");
  if (
    labels.some(
      (label) =>
        label.length === 0 ||
        label.length > 63 ||
        !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)
    )
  ) {
    return null;
  }
  return hostname;
}

export function parseTelemetryPayload(value: unknown): WidgetMountEvent {
  if (!isRecord(value)) throw new TelemetryRequestError("Invalid payload", 400);
  if (
    Object.keys(value).length !== ALLOWED_FIELDS.size ||
    Object.keys(value).some((key) => !ALLOWED_FIELDS.has(key))
  ) {
    throw new TelemetryRequestError("Invalid payload fields", 400);
  }
  if (value.event !== "widget_mount") {
    throw new TelemetryRequestError("Invalid event", 400);
  }
  if (typeof value.hostname !== "string") {
    throw new TelemetryRequestError("Invalid hostname", 400);
  }
  const hostname = normalizeHostname(value.hostname);
  if (!hostname) throw new TelemetryRequestError("Invalid hostname", 400);

  if (typeof value.vote_account !== "string") {
    throw new TelemetryRequestError("Invalid vote account", 400);
  }
  const voteAccount = value.vote_account.trim();
  try {
    address(voteAccount);
  } catch {
    throw new TelemetryRequestError("Invalid vote account", 400);
  }

  if (value.network !== "mainnet" && value.network !== "devnet") {
    throw new TelemetryRequestError("Invalid network", 400);
  }
  if (value.theme !== "light" && value.theme !== "dark") {
    throw new TelemetryRequestError("Invalid theme", 400);
  }
  if (
    !Array.isArray(value.tabs) ||
    value.tabs.length === 0 ||
    value.tabs.length > VALID_TABS.size ||
    value.tabs.some((tab) => typeof tab !== "string" || !VALID_TABS.has(tab)) ||
    new Set(value.tabs).size !== value.tabs.length
  ) {
    throw new TelemetryRequestError("Invalid tabs", 400);
  }
  if (typeof value.version !== "string") {
    throw new TelemetryRequestError("Invalid version", 400);
  }
  const version = value.version.trim();
  if (
    !version ||
    version.length > 64 ||
    !/^[a-z0-9][a-z0-9._+-]*$/i.test(version)
  ) {
    throw new TelemetryRequestError("Invalid version", 400);
  }

  return {
    event: "widget_mount",
    hostname,
    vote_account: voteAccount,
    network: value.network,
    tabs: value.tabs as TelemetryTab[],
    theme: value.theme,
    version
  };
}

async function readLimitedText(request: Request): Promise<string> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > TELEMETRY_BODY_LIMIT_BYTES
  ) {
    throw new TelemetryRequestError("Payload too large", 413);
  }
  if (!request.body) return "";

  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0;
  let text = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > TELEMETRY_BODY_LIMIT_BYTES) {
        await reader.cancel();
        throw new TelemetryRequestError("Payload too large", 413);
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } catch (error) {
    if (error instanceof TelemetryRequestError) throw error;
    throw new TelemetryRequestError("Invalid request encoding", 400);
  } finally {
    reader.releaseLock();
  }
}

export async function parseTelemetryRequest(
  request: Request
): Promise<WidgetMountEvent> {
  const contentType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (contentType !== "text/plain" && contentType !== "application/json") {
    throw new TelemetryRequestError("Unsupported content type", 415);
  }

  const text = await readLimitedText(request);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new TelemetryRequestError("Malformed JSON", 400);
  }
  return parseTelemetryPayload(value);
}

function utcDateString(date: Date, daysAgo = 0): string {
  const day = new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() - daysAgo
    )
  );
  return day.toISOString().slice(0, 10);
}

function dayKeys(day: string) {
  return {
    events: `${TELEMETRY_PREFIX}:${day}:events`,
    hosts: `${TELEMETRY_PREFIX}:${day}:hosts`,
    voteAccounts: `${TELEMETRY_PREFIX}:${day}:vote-accounts`
  };
}

export const TELEMETRY_REGISTRY_KEYS = [
  "telemetry:v1:registry:first_seen",
  "telemetry:v1:registry:last_seen",
  "telemetry:v1:registry:last_event"
];

export const TELEMETRY_RECORD_SCRIPT = `
local inserted = redis.call('HSETNX', KEYS[1], ARGV[1], ARGV[2])
if inserted == 1 then
  redis.call('SADD', KEYS[2], ARGV[3])
  redis.call('SADD', KEYS[3], ARGV[4])
  redis.call('EXPIREAT', KEYS[1], ARGV[5])
  redis.call('EXPIREAT', KEYS[2], ARGV[5])
  redis.call('EXPIREAT', KEYS[3], ARGV[5])
  redis.call('HSETNX', KEYS[4], ARGV[1], ARGV[6])
  redis.call('HSET', KEYS[5], ARGV[1], ARGV[6])
  redis.call('HSET', KEYS[6], ARGV[1], ARGV[2])
end
return inserted
`;

export async function recordWidgetMount(
  client: TelemetryRedisClient,
  event: WidgetMountEvent,
  now = new Date()
): Promise<boolean> {
  const day = utcDateString(now);
  const keys = dayKeys(day);
  const deduplicationKey = createHash("sha256")
    .update(event.hostname)
    .update("\0")
    .update(event.vote_account)
    .digest("hex");
  const dayStart = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  );
  const expiresAt = Math.floor(
    (dayStart + TELEMETRY_RETENTION_DAYS * 24 * 60 * 60 * 1000) / 1000
  );

  const result = await client.eval(TELEMETRY_RECORD_SCRIPT, {
    keys: [
      keys.events,
      keys.hosts,
      keys.voteAccounts,
      ...TELEMETRY_REGISTRY_KEYS
    ],
    arguments: [
      deduplicationKey,
      JSON.stringify(event),
      event.hostname,
      event.vote_account,
      String(expiresAt),
      day
    ]
  });
  return Number(result) === 1;
}

const TELEMETRY_STATS_SCRIPT = `
local mounts = 0
local hosts = {}
local votes = {}
local result = {}
for i = 1, 30 do
  mounts = mounts + redis.call('HLEN', KEYS[i])
  for _, host in ipairs(redis.call('SMEMBERS', KEYS[30 + i])) do hosts[host] = true end
  for _, vote in ipairs(redis.call('SMEMBERS', KEYS[60 + i])) do votes[vote] = true end
  if i == 1 or i == 7 or i == 30 then
    local host_count = 0
    local vote_count = 0
    for _ in pairs(hosts) do host_count = host_count + 1 end
    for _ in pairs(votes) do vote_count = vote_count + 1 end
    table.insert(result, mounts)
    table.insert(result, host_count)
    table.insert(result, vote_count)
  end
end
return result
`;

function asCount(value: unknown): number {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error("Invalid telemetry aggregate returned by Redis");
  }
  return count;
}

export async function getTelemetryStats(
  client: TelemetryRedisClient,
  now = new Date()
): Promise<TelemetryStats> {
  const days = Array.from({ length: 30 }, (_, index) =>
    utcDateString(now, index)
  );
  const keys = [
    ...days.map((day) => dayKeys(day).events),
    ...days.map((day) => dayKeys(day).hosts),
    ...days.map((day) => dayKeys(day).voteAccounts)
  ];
  const raw = await client.eval(TELEMETRY_STATS_SCRIPT, {
    keys,
    arguments: []
  });
  if (!Array.isArray(raw) || raw.length !== 9) {
    throw new Error("Invalid telemetry aggregate returned by Redis");
  }

  const window = (daysBack: number, offset: number): TelemetryWindow => ({
    start_date: utcDateString(now, daysBack - 1),
    end_date: utcDateString(now),
    deduplicated_mounts: asCount(raw[offset]),
    unique_hosts: asCount(raw[offset + 1]),
    unique_vote_accounts: asCount(raw[offset + 2])
  });

  return {
    windows: {
      "1d": window(1, 0),
      "7d": window(7, 3),
      "30d": window(30, 6)
    }
  };
}
