import { createClient, type RedisClientType } from "redis";

const REDIS_FAILURE_COOLDOWN_MS = 30_000;

// Redis v6 uses empty object generic defaults for clients without extensions.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type RedisClient = RedisClientType<{}, {}, {}, 3, {}>;

interface RedisState {
  client: RedisClient | null;
  connection: Promise<RedisClient> | null;
  unavailableUntil: number;
}

const redisGlobal = globalThis as typeof globalThis & {
  __deepstakeRedisState?: RedisState;
};

const state =
  redisGlobal.__deepstakeRedisState ??
  ({
    client: null,
    connection: null,
    unavailableUntil: 0
  } satisfies RedisState);

redisGlobal.__deepstakeRedisState = state;

export function isRedisConfigured(): boolean {
  return Boolean(process.env.REDIS_URL);
}

export async function getRedisClient(): Promise<RedisClient> {
  if (Date.now() < state.unavailableUntil) {
    throw new Error("Redis connection is in cooldown");
  }
  if (state.client?.isReady) return state.client;
  if (state.connection) return state.connection;

  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL is not configured");

  const client = createClient({
    url,
    socket: { connectTimeout: 1_000, reconnectStrategy: false }
  });
  client.on("error", () => undefined);

  state.connection = client
    .connect()
    .then(() => {
      state.client = client;
      state.unavailableUntil = 0;
      return client;
    })
    .catch((error) => {
      state.unavailableUntil = Date.now() + REDIS_FAILURE_COOLDOWN_MS;
      client.destroy();
      throw error;
    })
    .finally(() => {
      state.connection = null;
    });

  return state.connection;
}
