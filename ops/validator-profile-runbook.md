# Validator Profile Operations Runbook

## Scraping

The backend exposes Prometheus metrics at `GET /api/metrics`. Production
startup does not expose metrics unless `METRICS_BEARER_TOKEN` is configured.
Configure the external Prometheus target with the same bearer token and keep
the endpoint private at the reverse proxy whenever possible.

```yaml
scrape_configs:
  - job_name: deepstake-backend
    metrics_path: /api/metrics
    bearer_token: "<METRICS_BEARER_TOKEN>"
    static_configs:
      - targets: ["backend.internal:3000"]
```

Do not forward `/api/metrics` through the public widget-facing nginx location.
`GET /api/health` is a liveness check only. It deliberately does not query
Redis or external providers, because those failures have application-level
fallbacks and must not cause container restart loops.

When Prometheus cannot use a private backend address, restrict the exact route
at nginx in addition to bearer authentication:

```nginx
location = /api/metrics {
    allow 10.0.0.0/8;
    deny all;
    proxy_pass http://127.0.0.1:3000;
}
```

Load `ops/prometheus/validator-profile-alerts.yml` into the external
Prometheus rule configuration. Route `critical` alerts to the primary on-call
channel and `warning` alerts to the service operations channel.

## Signals

- `deepstake_validator_profile_requests_total` is the user-visible profile
  result. The `error` status represents an HTTP 500 aggregation failure.
- `deepstake_validator_logo_requests_total` and
  `deepstake_validator_logo_request_duration_seconds` track the independent
  logo path. A usable Stakewiz logo returns without waiting for Validators.app.
- `deepstake_validator_provider_requests_total` identifies upstream failure
  type without putting validator addresses or raw errors in metric labels.
- `deepstake_validator_cache_operations_total` covers lookup freshness,
  Redis reads/writes, and distributed lock operations.
- `deepstake_validator_profile_field_states_total` shows fresh, stale, and
  missing results for each bounded profile field.
- `deepstake_validator_background_operations_total` shows asynchronous
  enhancement and stale-refresh completion.

Operational logs are one-line JSON. Filter on the `event` field. Raw error
messages are newline-stripped and truncated; tokens, wallet addresses, and
validator vote accounts are not logged by the profile pipeline.

## Alert Response

1. Confirm `/api/health` and the Prometheus target are reachable.
2. Separate profile aggregation errors from upstream provider degradation.
3. Check cache read/write/lock failures. Redis failure should fall back to
   direct aggregation, but latency and provider traffic will rise.
4. For a single-provider alert, confirm that other providers still produce a
   partial or stale profile before escalating.
5. If profiles are incorrect or broadly unavailable, restore the previous
   paired frontend/backend deployment and investigate provider and cache behavior.

## Failure Drills

Run these in staging before deployment:

1. Block one external provider and verify its failure metric/log classification
   while the endpoint still returns a partial or cached profile.
2. Delay a provider beyond its configured timeout and verify the timeout
   counter, bounded request latency, and fallback result.
3. Return malformed provider JSON and verify the parse outcome.
4. Stop Redis and verify direct aggregation continues, cache alerts fire, and
   the container remains healthy.
5. Seed stale cache records and verify they return immediately while a
   background refresh is recorded.

## Cache Transition

The v3 namespace applies to group records and distributed locks. Expect a
controlled cold-cache refresh after deployment. Leave v2 keys to expire
naturally so the previous paired deployment can still read them if restored.
After restart, inspect `/api/metrics` to confirm that only the active providers
generate new request series.
