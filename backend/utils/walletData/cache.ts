import { randomUUID } from "node:crypto";

import { getRedisClient, isRedisConfigured } from "../redis";

export const WALLET_DATA_RESOURCES = [
  "native-stake",
  "blaze-applied",
  "vault-manage"
] as const;

export type WalletDataResource = (typeof WALLET_DATA_RESOURCES)[number];

export interface WalletCacheRecord<T = unknown> {
  version: 1;
  cachedAt: number;
  freshUntil: number;
  staleUntil: number;
  data: T;
}

export interface WalletDataCache {
  read<T>(
    resource: WalletDataResource,
    network: string,
    wallet: string
  ): Promise<WalletCacheRecord<T> | null>;
  write<T>(
    resource: WalletDataResource,
    network: string,
    wallet: string,
    record: WalletCacheRecord<T>
  ): Promise<void>;
  delete(
    resource: WalletDataResource,
    network: string,
    wallet: string
  ): Promise<void>;
  acquireLock(
    resource: WalletDataResource,
    network: string,
    wallet: string,
    ttlMs: number
  ): Promise<string | null>;
  releaseLock(
    resource: WalletDataResource,
    network: string,
    wallet: string,
    token: string
  ): Promise<void>;
}

const CACHE_PREFIX = "wallet-data:v1";
let redisCache: WalletDataCache | null | undefined;

export function walletDataCacheKey(
  resource: WalletDataResource,
  network: string,
  wallet: string
): string {
  return `${CACHE_PREFIX}:${resource}:${network}:${encodeURIComponent(wallet)}`;
}

function lockKey(
  resource: WalletDataResource,
  network: string,
  wallet: string
): string {
  return `${CACHE_PREFIX}:lock:${resource}:${network}:${encodeURIComponent(wallet)}`;
}

function parseRecord<T>(
  serialized: string | null
): WalletCacheRecord<T> | null {
  if (!serialized) return null;
  try {
    const value = JSON.parse(serialized) as Record<string, unknown>;
    if (
      value.version !== 1 ||
      typeof value.cachedAt !== "number" ||
      typeof value.freshUntil !== "number" ||
      typeof value.staleUntil !== "number" ||
      !("data" in value)
    ) {
      return null;
    }
    return value as unknown as WalletCacheRecord<T>;
  } catch {
    return null;
  }
}

class RedisWalletDataCache implements WalletDataCache {
  async read<T>(
    resource: WalletDataResource,
    network: string,
    wallet: string
  ): Promise<WalletCacheRecord<T> | null> {
    const client = await getRedisClient();
    return parseRecord<T>(
      await client.get(walletDataCacheKey(resource, network, wallet))
    );
  }

  async write<T>(
    resource: WalletDataResource,
    network: string,
    wallet: string,
    record: WalletCacheRecord<T>
  ): Promise<void> {
    const ttlMs = Math.max(1, record.staleUntil - Date.now());
    const client = await getRedisClient();
    await client.set(
      walletDataCacheKey(resource, network, wallet),
      JSON.stringify(record),
      { PX: ttlMs }
    );
  }

  async delete(
    resource: WalletDataResource,
    network: string,
    wallet: string
  ): Promise<void> {
    const client = await getRedisClient();
    await client.del(walletDataCacheKey(resource, network, wallet));
  }

  async acquireLock(
    resource: WalletDataResource,
    network: string,
    wallet: string,
    ttlMs: number
  ): Promise<string | null> {
    const client = await getRedisClient();
    const token = randomUUID();
    const result = await client.set(lockKey(resource, network, wallet), token, {
      NX: true,
      PX: ttlMs
    });
    return result === "OK" ? token : null;
  }

  async releaseLock(
    resource: WalletDataResource,
    network: string,
    wallet: string,
    token: string
  ): Promise<void> {
    const client = await getRedisClient();
    await client.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
      { keys: [lockKey(resource, network, wallet)], arguments: [token] }
    );
  }
}

export function getWalletDataCache(): WalletDataCache | null {
  if (!isRedisConfigured()) return null;
  if (redisCache === undefined) redisCache = new RedisWalletDataCache();
  return redisCache;
}
