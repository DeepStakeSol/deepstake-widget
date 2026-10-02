import { type NextRequest, NextResponse } from "next/server";
import { address } from "@solana/kit";

import { getRedisClient, isRedisConfigured } from "@/utils/redis";
import { getJpoolStakePoolAddress } from "@/utils/consts";
import { createRpcConnection, getRpcEndpoint } from "@/utils/solana/rpc";
import { JpoolRouteError } from "@/utils/solana/jpool/errors";
import { fetchJpoolStakePool } from "@/utils/solana/jpool/pool";
import { jpoolErrorResponse } from "@/utils/solana/jpool/response";

// The rate only moves materially at epoch boundaries; the deposit route always
// re-reads the pool, so this cache only affects the pre-submit estimate.
const POOL_CACHE_TTL_MS = 5 * 60_000;
const POOL_CACHE_PREFIX = "jpool:v1:pool";
// Size of an SPL Token account (the JSOL ATA a first deposit creates).
const TOKEN_ACCOUNT_SIZE = BigInt(165);

export interface JpoolPoolResponse {
  network: string;
  poolAddress: string;
  totalLamports: string;
  poolTokenSupply: string;
  lastUpdateEpoch: string;
  solDepositFee: { denominator: string; numerator: string };
  depositsRestricted: boolean;
  // Live rent-exempt minimum for the JSOL ATA; null when the read failed (the
  // widget then reserves a conservative constant).
  ataRentLamports: string | null;
}

async function readCache(key: string): Promise<JpoolPoolResponse | null> {
  if (!isRedisConfigured()) return null;
  try {
    const value = await (await getRedisClient()).get(key);
    return value ? (JSON.parse(value) as JpoolPoolResponse) : null;
  } catch {
    return null;
  }
}

async function writeCache(key: string, value: JpoolPoolResponse) {
  if (!isRedisConfigured()) return;
  try {
    await (await getRedisClient()).set(key, JSON.stringify(value), {
      PX: POOL_CACHE_TTL_MS
    });
  } catch {
    // Redis is optional for this read.
  }
}

export async function GET(request: NextRequest) {
  try {
    const network = request.nextUrl.searchParams.get("network") || "mainnet";
    const poolAddress = getJpoolStakePoolAddress(network);
    if (!poolAddress) throw new JpoolRouteError("JPOOL_MAINNET_ONLY", 400);

    const cacheKey = `${POOL_CACHE_PREFIX}:${network}:${poolAddress}`;
    const cached = await readCache(cacheKey);
    if (cached) return NextResponse.json(cached);

    if (!getRpcEndpoint(network)) {
      throw new JpoolRouteError("JPOOL_RPC_UNAVAILABLE", 503);
    }
    const rpc = createRpcConnection(network);
    const [pool, ataRentLamports] = await Promise.all([
      fetchJpoolStakePool(rpc, address(poolAddress)),
      rpc
        .getMinimumBalanceForRentExemption(TOKEN_ACCOUNT_SIZE, {
          commitment: "confirmed"
        })
        .send()
        .then((rent) => rent.toString())
        .catch(() => null)
    ]);
    const body: JpoolPoolResponse = {
      network,
      poolAddress,
      totalLamports: pool.totalLamports.toString(),
      poolTokenSupply: pool.poolTokenSupply.toString(),
      lastUpdateEpoch: pool.lastUpdateEpoch.toString(),
      solDepositFee: {
        denominator: pool.solDepositFee.denominator.toString(),
        numerator: pool.solDepositFee.numerator.toString()
      },
      depositsRestricted: pool.solDepositAuthority !== null,
      ataRentLamports
    };
    await writeCache(cacheKey, body);
    return NextResponse.json(body);
  } catch (error) {
    return jpoolErrorResponse(error, "JPool pool read error:");
  }
}
