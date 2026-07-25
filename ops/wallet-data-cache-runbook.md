# Wallet Data Cache Runbook

## Scope

Redis namespace: `wallet-data:v1`. Resources are `native-stake`, `blaze-applied`, and `vault-manage`. Keys contain resource, network, and URL-encoded wallet address. Lock keys use the same namespace with a `lock` segment.

## Metrics

- `deepstake_wallet_cache_operations_total{resource,operation,result,network}` covers reads, lookups, writes, deletes, locks, and coalesced refreshes.
- `deepstake_wallet_cache_refresh_duration_seconds{resource,outcome,network}` measures live provider refresh latency and failures.

Useful checks:

- Rising `operation="read",result="error"`: check Redis connectivity and `REDIS_URL`. Live provider fallback remains active.
- Rising `operation="lookup",result="stale"` with refresh errors: investigate the resource upstream. Stale values remain available only through their retention window.
- Blaze registration failures: check backend logs for `Blaze CLS registration error`; the browser no longer calls SolBlaze directly.
- Repeated Vault `updating`: the short 10-second fresh window is intentional while Stakebot output catches up.

## Invalidation Audit

After a mutation, verify the confirmation request includes `cacheMutation.walletAddress` and one of:

- `native-stake`, `native-unstake`, `native-withdraw` -> `native-stake`
- `blaze-stake` -> `blaze-applied`
- `vault-stake` -> `vault-manage`

Mutation contexts force `confirmed` commitment. The frontend's next corresponding read must include `refresh=true`. Blaze registration performs a second invalidation only after the upstream registration returns a successful HTTP status.

## Failure Drill

1. Stop Redis or set an unreachable test `REDIS_URL`.
2. Request each Manage dataset and confirm live data is still returned.
3. Restore Redis and request each route with `refresh=true`.
4. Confirm successful wallet-cache writes in metrics.
5. Exercise one mutation per provider and confirm a delete followed by a bypass/write for the matching resource.
