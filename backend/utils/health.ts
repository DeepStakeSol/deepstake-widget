import packageJson from "@/package.json";
import { getRedisClient, isRedisConfigured } from "@/utils/redis";
import { createRpcConnection, getRpcEndpoint } from "@/utils/solana/rpc";

const RPC_TIMEOUT_MS = 3_000;
const REDIS_TIMEOUT_MS = 1_000;
// Monitors and the Compose healthcheck poll often; one RPC call per window.
export const HEALTH_CACHE_TTL_MS = 30_000;

export interface HealthReport {
  status: "ok" | "degraded";
  service: "deepstake-backend";
  checks: {
    rpc_mainnet: { ok: boolean; latencyMs?: number };
    redis: { ok: boolean };
    config: {
      rpc_mainnet: boolean;
      rpc_devnet: boolean;
      metrics_token: boolean;
      telemetry_token: boolean;
    };
  };
  version: string;
  timestamp: string;
}

let cached: { expiresAt: number; report: Promise<HealthReport> } | null = null;

function isSet(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Error details are only logged: an RPC error can echo the endpoint URL, which
// may carry an API key.
async function checkRpcMainnet(): Promise<HealthReport["checks"]["rpc_mainnet"]> {
  if (!getRpcEndpoint("mainnet")) return { ok: false };
  const startedAt = Date.now();
  try {
    await withTimeout(
      createRpcConnection("mainnet")
        .getLatestBlockhash({ commitment: "confirmed" })
        .send({ abortSignal: AbortSignal.timeout(RPC_TIMEOUT_MS) }),
      RPC_TIMEOUT_MS
    );
    return { ok: true, latencyMs: Date.now() - startedAt };
  } catch (error) {
    console.warn(
      "Health check: mainnet RPC failed:",
      error instanceof Error ? error.name : "unknown error"
    );
    return { ok: false };
  }
}

async function checkRedis(): Promise<HealthReport["checks"]["redis"]> {
  if (!isRedisConfigured()) return { ok: false };
  try {
    await withTimeout(
      getRedisClient().then((client) => client.ping()),
      REDIS_TIMEOUT_MS
    );
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

async function buildReport(): Promise<HealthReport> {
  const [rpcMainnet, redis] = await Promise.all([
    checkRpcMainnet(),
    checkRedis()
  ]);
  const config = {
    rpc_mainnet: isSet("MAINNET_RPC_ENDPOINT"),
    rpc_devnet: isSet("DEVNET_RPC_ENDPOINT"),
    metrics_token: isSet("METRICS_BEARER_TOKEN"),
    telemetry_token: isSet("TELEMETRY_STATS_TOKEN")
  };
  // Redis down still serves the widget; devnet and token gaps are reported
  // but do not degrade the status.
  const healthy = rpcMainnet.ok && config.rpc_mainnet && redis.ok;
  return {
    status: healthy ? "ok" : "degraded",
    service: "deepstake-backend",
    checks: { rpc_mainnet: rpcMainnet, redis, config },
    version: packageJson.version,
    timestamp: new Date().toISOString()
  };
}

export function getHealthReport(): Promise<HealthReport> {
  const now = Date.now();
  if (!cached || now >= cached.expiresAt) {
    cached = { expiresAt: now + HEALTH_CACHE_TTL_MS, report: buildReport() };
  }
  return cached.report;
}

export function resetHealthCacheForTests(): void {
  cached = null;
}
