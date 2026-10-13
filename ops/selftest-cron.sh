#!/usr/bin/env bash
# Runs POST /api/selftest on the VPS (from cron, every 15 minutes) and reports
# the result:
#   - pass: pings HEALTHCHECKS_PING_URL (dead man's switch: a missed ping makes
#     healthchecks.io alert, which covers cron, the host and this script);
#   - fail: sends the failing checks to Telegram. A continuing failure is
#     repeated every SELFTEST_REMIND_SECONDS; recovery is announced once.
# Exits 0 on pass, 1 on fail.
#
# Settings come from the environment, else from the repository's env files:
#   backend/.env  SELFTEST_TOKEN
#   .env          HEALTHCHECKS_PING_URL, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
# Optional: SELFTEST_URL (default http://127.0.0.1:3000/api/selftest),
# SELFTEST_REMIND_SECONDS (default 10800), SELFTEST_STATE_FILE,
# TELEGRAM_API (default https://api.telegram.org).
set -uo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Reads KEY=value from an env file without executing it.
env_value() {
  local key=$1 file=$2 value
  [[ -r "$file" ]] || return 0
  value="$(grep -E "^${key}=" "$file" | tail -n 1 | cut -d= -f2-)"
  value="${value%\"}"; value="${value#\"}"
  value="${value%\'}"; value="${value#\'}"
  printf '%s' "$value"
}

SELFTEST_TOKEN="${SELFTEST_TOKEN:-$(env_value SELFTEST_TOKEN "$REPO_DIR/backend/.env")}"
HEALTHCHECKS_PING_URL="${HEALTHCHECKS_PING_URL:-$(env_value HEALTHCHECKS_PING_URL "$REPO_DIR/.env")}"
TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-$(env_value TELEGRAM_BOT_TOKEN "$REPO_DIR/.env")}"
TELEGRAM_CHAT_ID="${TELEGRAM_CHAT_ID:-$(env_value TELEGRAM_CHAT_ID "$REPO_DIR/.env")}"
SELFTEST_URL="${SELFTEST_URL:-http://127.0.0.1:3000/api/selftest}"
SELFTEST_REMIND_SECONDS="${SELFTEST_REMIND_SECONDS:-10800}"
SELFTEST_STATE_FILE="${SELFTEST_STATE_FILE:-${XDG_STATE_HOME:-$HOME/.local/state}/deepstake-selftest.state}"
TELEGRAM_API="${TELEGRAM_API:-https://api.telegram.org}"

log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*"; }

# Secrets go to curl through --config on stdin, never on the command line,
# so they do not show up in `ps`.
send_telegram() {
  if [[ -z "$TELEGRAM_BOT_TOKEN" || -z "$TELEGRAM_CHAT_ID" ]]; then
    log "telegram not configured; message was: $1" >&2
    return 0
  fi
  printf 'url = "%s/bot%s/sendMessage"\n' "$TELEGRAM_API" "$TELEGRAM_BOT_TOKEN" \
    | curl -sS -m 15 -o /dev/null -f -K - \
        --data-urlencode "chat_id=$TELEGRAM_CHAT_ID" \
        --data-urlencode "text=$1" \
    || log "telegram send failed" >&2
}

ping_healthchecks() {
  if [[ -z "$HEALTHCHECKS_PING_URL" ]]; then
    log "HEALTHCHECKS_PING_URL not set; skipping ping" >&2
    return 0
  fi
  printf 'url = "%s"\n' "$HEALTHCHECKS_PING_URL" \
    | curl -sS -m 10 --retry 3 -o /dev/null -f -K - \
    || log "healthchecks ping failed" >&2
}

# One line per failed check when jq is available, else the raw body. The body
# never contains RPC URLs or keys: the backend redacts them.
summarize() {
  local body=$1
  if command -v jq >/dev/null 2>&1 \
    && jq -e '.checks | type == "object"' <<<"$body" >/dev/null 2>&1; then
    jq -r '.checks | to_entries[] | select(.value.ok | not)
      | "\(.key): \(.value.stage) - \(.value.error)"' <<<"$body"
  else
    printf '%s' "${body:0:3000}"
  fi
}

passed() {
  [[ "$code" == "200" ]] || return 1
  if command -v jq >/dev/null 2>&1; then
    jq -e '.ok == true' <<<"$body" >/dev/null 2>&1
  else
    [[ "$body" == '{"ok":true'* ]]
  fi
}

read_state() {
  [[ -r "$SELFTEST_STATE_FILE" ]] && cat "$SELFTEST_STATE_FILE" || echo "ok 0"
}

write_state() {
  mkdir -p "$(dirname "$SELFTEST_STATE_FILE")" \
    && printf '%s %s\n' "$1" "$2" >"$SELFTEST_STATE_FILE"
}

if [[ -z "$SELFTEST_TOKEN" ]]; then
  log "SELFTEST_TOKEN is not set (environment or backend/.env)" >&2
  exit 1
fi

response="$(printf 'header = "Authorization: Bearer %s"\n' "$SELFTEST_TOKEN" \
  | curl -sS -m 30 -X POST -K - -w '\n%{http_code}' "$SELFTEST_URL" 2>&1)"
code="${response##*$'\n'}"
body="${response%$'\n'*}"
read -r previous last_alert <<<"$(read_state)"
now="$(date +%s)"
host="$(hostname)"

if passed; then
  log "selftest ok: $body"
  ping_healthchecks
  if [[ "$previous" == "fail" ]]; then
    send_telegram "✅ DeepStake selftest recovered on $host"
  fi
  write_state ok "$now"
  exit 0
fi

if [[ "$code" =~ ^[0-9]{3}$ && "$code" != "000" ]]; then
  status="HTTP $code"
  details="$(summarize "$body")"
else
  # curl itself failed: the backend is down or unreachable.
  status="no response"
  details="$(printf '%s' "${body:0:500}" | tr -s '\n' ' ')"
  details="request failed: ${details% }"
fi
log "selftest FAILED ($status): $details" >&2

if [[ "$previous" != "fail" ]] \
  || (( now - ${last_alert:-0} >= SELFTEST_REMIND_SECONDS )); then
  prefix="❌ DeepStake selftest failed"
  [[ "$previous" == "fail" ]] && prefix="❌ DeepStake selftest still failing"
  send_telegram "$prefix on $host ($status)
$details"
  write_state fail "$now"
else
  write_state fail "${last_alert:-$now}"
fi
exit 1
