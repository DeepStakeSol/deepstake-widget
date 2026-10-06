import { isIP } from "node:net";

// Minimal client surface, so tests can pass a stub.
export interface RateLimitRedisClient {
  eval(
    script: string,
    options: { keys: string[]; arguments: string[] }
  ): Promise<unknown>;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

// TEMP(JPOOL-TMP-12): fixed window (INCR + PEXPIRE). A burst straddling a
// window boundary can pass up to twice the limit; a sliding window is not
// needed for the bind proxy yet.
const FIXED_WINDOW_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
local ttl = redis.call('PTTL', KEYS[1])
if count == 1 or ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return { count, ttl }
`;

// Counts one attempt against `key`. A Redis failure propagates: callers fail
// closed.
export async function consumeRateLimit(
  client: RateLimitRedisClient,
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  const reply = await client.eval(FIXED_WINDOW_SCRIPT, {
    keys: [key],
    arguments: [String(windowMs)]
  });
  if (!Array.isArray(reply) || reply.length !== 2) {
    throw new Error("Unexpected rate limit reply");
  }
  const count = Number(reply[0]);
  const ttlMs = Number(reply[1]);
  if (!Number.isFinite(count) || !Number.isFinite(ttlMs)) {
    throw new Error("Unexpected rate limit reply");
  }
  return {
    allowed: count <= limit,
    retryAfterSeconds: Math.max(1, Math.ceil(ttlMs / 1000))
  };
}

// Trusted only because nginx sets X-Real-IP from $remote_addr and the backend
// listens on 127.0.0.1 behind it (README, docker-compose.prod.yaml). Requests
// without a valid header share one "unknown" bucket.
export function clientIp(headers: Headers): string {
  const value = headers.get("x-real-ip")?.trim() ?? "";
  return isIP(value) ? value : "unknown";
}
