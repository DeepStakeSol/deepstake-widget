# Selftest Monitoring Runbook

## Scope

`ops/selftest-cron.sh` runs `POST /api/selftest` on the VPS every 15 minutes. The selftest builds a mainnet Native stake and a JPool deposit for `SELFTEST_WALLET` and simulates both without signatures. A pass pings healthchecks.io; a failure goes to the DeepStake alerts chat in Telegram. External uptime of `/api/health` is a separate monitor (see the README, "Monitoring").

| Event | Alert |
|---|---|
| Selftest fails (any check) | Telegram from the script on the next run (at most 15 minutes), with the failing checks |
| Failure continues | Telegram reminder every 3 hours (`SELFTEST_REMIND_SECONDS`) |
| Selftest passes again | One Telegram "recovered" message |
| Cron, the script or the host stops running | healthchecks.io alert after period + grace (25 minutes) |

## Setup

1. Backend, in the private `backend/.env`. Restart the backend after editing (`docker compose -f docker-compose.prod.yaml up -d backend`):

   ```bash
   SELFTEST_TOKEN=<random, e.g. openssl rand -hex 32>
   SELFTEST_WALLET=<mainnet wallet address, never a key; more than about 1.002 SOL>
   SELFTEST_VOTE_ACCOUNT=<validator vote account>
   ```

2. healthchecks.io (Viktor's account): create a check with period 15 minutes and grace 10 minutes. Connect the Telegram integration to the DeepStake alerts chat. Copy the ping URL.

3. Host-only settings in the private root `.env`. Compose does not pass these to any container:

   ```bash
   HEALTHCHECKS_PING_URL=https://hc-ping.com/<uuid>
   TELEGRAM_BOT_TOKEN=<from Viktor, privately>
   TELEGRAM_CHAT_ID=<DeepStake alerts chat id>
   ```

   Keep both files readable only by the deploy user (`chmod 600 .env backend/.env`).

4. Run the script once by hand. It should print `selftest ok` and exit 0, and healthchecks.io should show the ping:

   ```bash
   ./ops/selftest-cron.sh
   ```

5. Install the cron entry for the deploy user (`crontab -e`). Output goes to the journal (`journalctl -t deepstake-selftest`):

   ```cron
   */15 * * * * /path/to/deepstake-widget/ops/selftest-cron.sh 2>&1 | logger -t deepstake-selftest
   ```

The script needs `bash` and `curl`. With `jq` installed, alerts list one line per failed check (`native: generate - fetch failed`); without it, alerts carry the raw response body. Secrets reach `curl` through a config on stdin, so they never appear in `ps`. Failure state is kept in `~/.local/state/deepstake-selftest.state`.

## Reading an Alert

Each failed check names a stage:

- `config`: `SELFTEST_WALLET` or `SELFTEST_VOTE_ACCOUNT` is missing or invalid in `backend/.env`.
- `generate`: building the transaction failed. `fetch failed`, `timeout`, `JPOOL_RPC_UNAVAILABLE` or `MAINNET_RPC_ENDPOINT environment variable not set` point to the RPC: check `/api/health`, `MAINNET_RPC_ENDPOINT` and the RPC provider's status. `InstructionError ... Custom 1` or `JPOOL_INSUFFICIENT_FUNDS` means `SELFTEST_WALLET` holds too little SOL. `Vote account not found` means a wrong `SELFTEST_VOTE_ACCOUNT`. `JPOOL_DEPOSITS_RESTRICTED` means JPool paused deposits.
- `simulate`: the finished transaction failed simulation. The error and last program log line are included.
- `no response`: the backend did not answer on `127.0.0.1:3000`. Check `docker compose -f docker-compose.prod.yaml ps --all`.
- `HTTP 401`: `SELFTEST_TOKEN` differs between the backend and the script, or the backend was not restarted after editing `backend/.env`.

`jpool` passing with `"skipped":"JPOOL_POOL_UPDATING"` is normal for a while after each epoch starts, until JPool updates the pool.

## Failure Drill

1. Set `MAINNET_RPC_ENDPOINT` in `backend/.env` to an unreachable URL and restart the backend.
2. Run `./ops/selftest-cron.sh`: it exits 1 and Telegram receives `native: generate - fetch failed` and `jpool: generate - JPOOL_RPC_UNAVAILABLE`. `/api/health` returns `503`.
3. Restore the variable, restart the backend and run the script again: it exits 0 and Telegram receives "recovered".
4. To test the dead man's switch, comment out the cron entry: healthchecks.io alerts after about 25 minutes. Restore the entry.
