#!/usr/bin/env bash
# Post-deploy smoke test for deepstake.info. Run right after
#   docker compose -f docker-compose.prod.yaml up -d --build
# Exits non-zero on the first failed check. Spends no SOL and needs no secrets.
#
#   BASE               public origin (default https://deepstake.info)
#   BACKEND_URL        VITE_BACKEND_URL the bundle must be built with (default $BASE/api)
#   FORBIDDEN_PATTERN  extra extended regex that must not appear in the bundle,
#                      e.g. the host of the private RPC from backend/.env
set -euo pipefail

BASE="${BASE:-https://deepstake.info}"
BASE="${BASE%/}"
BACKEND_URL="${BACKEND_URL:-$BASE/api}"
BACKEND_URL="${BACKEND_URL%/}"
# The widget makes no RPC calls of its own; any of these in the bundle means an
# RPC URL or key leaked into the build.
RPC_PATTERN='helius-rpc\.com|api-key=|api\.mainnet-beta\.solana\.com|api\.devnet\.solana\.com|quiknode\.pro|rpcpool\.com|alchemy\.com'
if [[ -n "${FORBIDDEN_PATTERN:-}" ]]; then
  RPC_PATTERN="$RPC_PATTERN|$FORBIDDEN_PATTERN"
fi

CURL=(curl -sS --max-time 15)
step() { printf '%-44s' "$1"; }
pass() { echo "ok"; }
fail() {
  echo "FAIL"
  echo "  $1" >&2
  exit 1
}

step "health is ok"
health="$("${CURL[@]}" -w '\n%{http_code}' "$BASE/api/health")" || fail "request failed"
[[ "${health##*$'\n'}" == "200" ]] || fail "HTTP ${health##*$'\n'}: ${health%$'\n'*}"
grep -q '"status":"ok"' <<<"${health%$'\n'*}" || fail "${health%$'\n'*}"
pass

step "stake minimum answers"
"${CURL[@]}" -f "$BASE/api/stake/minimum?network=mainnet" \
  | grep -q '"minimumStakeSol"' || fail "no minimumStakeSol in the response"
pass

bundle="$(mktemp)"
trap 'rm -f "$bundle"' EXIT
step "widget bundle is served"
"${CURL[@]}" -f -o "$bundle" "$BASE/api/w/widget.iife.js" || fail "request failed"
grep -q 'var DeepStakeWidget=' "$bundle" || fail "not the widget IIFE bundle"
pass

step "bundle uses $BACKEND_URL"
grep -qF "\"$BACKEND_URL\"" "$bundle" \
  || fail "VITE_BACKEND_URL in the bundle is not \"$BACKEND_URL\""
pass

step "bundle contains no RPC endpoint"
if leaked="$(grep -oE "$RPC_PATTERN" "$bundle" | sort -u | tr '\n' ' ')" && [[ -n "$leaked" ]]; then
  fail "found: $leaked"
fi
pass

step "transaction relay is routed"
relay="$("${CURL[@]}" -X POST -H 'Content-Type: application/json' -d '{}' \
  -w '\n%{http_code}' "$BASE/api/transaction/send?network=mainnet")" || fail "request failed"
[[ "${relay##*$'\n'}" == "400" ]] \
  && grep -q '"code":"INVALID_TRANSACTION"' <<<"${relay%$'\n'*}" \
  || fail "expected 400 INVALID_TRANSACTION, got HTTP ${relay##*$'\n'}: ${relay%$'\n'*}"
pass

step "metrics require a token"
code="$("${CURL[@]}" -o /dev/null -w '%{http_code}' "$BASE/api/metrics")" || fail "request failed"
[[ "$code" == "401" ]] || fail "expected 401, got $code"
pass

echo "smoke ok"
