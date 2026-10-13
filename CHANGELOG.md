# Changelog

All notable changes to DeepStake Widget are documented here. This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- `scripts/smoke.sh`: post-deploy smoke test (health, stake minimum, widget bundle and its backend URL, no RPC endpoint or API key in the bundle, relay routing, metrics auth). Exits non-zero on the first failure.
- `POST /api/selftest` (bearer `SELFTEST_TOKEN`): builds a mainnet native stake of the current minimum and a 0.01 SOL JPool deposit for `SELFTEST_WALLET` with the `/api/stake/generate` and `/api/jpool/stake/generate` code, and simulates both unsigned (`sigVerify: false`, `replaceRecentBlockhash: true`). `?check=native|jpool` runs one. Returns `200` when every check passes, otherwise `503` with each failing check's `stage` (`config`, `generate`, `simulate`). JPool's epoch update is reported as `skipped`, not a failure. Rate-limited to 10 requests per minute per IP. New backend variables: `SELFTEST_TOKEN`, `SELFTEST_WALLET`, `SELFTEST_VOTE_ACCOUNT`.
- `ops/selftest-cron.sh` and `ops/selftest-runbook.md`: a cron job (every 15 minutes) runs the selftest on the host. A pass pings healthchecks.io (`HEALTHCHECKS_PING_URL`); a failure sends the failing checks to Telegram (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`), with a reminder every 3 hours and one recovery message. README gains a Monitoring section.

### Changed

- `GET /api/health` now checks dependencies: a real mainnet `getLatestBlockhash` (3 s timeout), a Redis ping, and whether required variables are set (no values). Results are cached for 30 s. A missing or unreachable mainnet RPC returns `503` (`"status":"degraded"`), so the production container turns `unhealthy`; a Redis failure is `degraded` with `200`.

### Security

- The widget bundle no longer contains an RPC endpoint. Native, Blaze and Vault stakes now go through the backend relay (`POST /api/transaction/send`), as JPool already did; `VITE_*_RPC_ENDPOINT` is removed. Blaze and Vault no longer simulate in the browser before signing: the relay simulates the signed transaction.
- `POST /api/transaction/send` is limited to 20 requests per minute per client IP (`429 RATE_LIMITED` with `Retry-After`). The limiter is skipped when Redis is unavailable.
- Vault stakes use the built-in vSOL mint instead of the build-time `VITE_VAULT_MINT`, which the production Compose builder never received; a clean production build no longer sends `mint=undefined`.
- Removed the unused Next.js dependency from the frontend; wallet icons use a native `<img>`. Also removed the unused `node-fetch`, `tweetnacl`, and `bs58` dependencies.
- Removed Node polyfills (`vite-plugin-node-polyfills`) from the widget bundle; Blaze and Vault transactions are decoded with `@solana/kit`. The bundle shrinks from 977 KB to 890 KB.
- Backend Next.js upgraded from 15.1.11 to 15.5.27 (with `eslint-config-next` and `@next/eslint-plugin-next`), removing the critical production advisory.
- Dev tooling lockfiles refreshed with non-breaking fixes; Vitest updated to 4.1.11.
- Added weekly Dependabot updates and a CI workflow (typecheck, tests, build, and a critical-level production audit) for both packages.
- Known residual: the PostCSS advisory pinned inside Next.js 15 remains in the backend until it is fixed upstream; `braces` reaches the backend only through Next's ESLint plugin (dev only).

## [2.0.0] - 2026-10-13

### Added

- JPool tab ("Direct staking JPool", opt-in via `"tabs": [..., "jpool"]`, mainnet only): deposits SOL into the JPool stake pool for JSOL with a `direct:<vote_account>` memo, so JPool counts the deposit as direct stake for the widget's validator.
- Optional wallet binding after a deposit and from the Manage view: the wallet signs a JPool `bindWallet` message and the backend forwards it to JPool (`POST /api/jpool/bind`) with rate limiting.
- JPool Manage view: JSOL balance, the amount JPool counts for the validator, the wallet's binding status.
- Eligibility check before the tab is shown (`GET /api/jpool/eligibility`): the tab is hidden only when JPool marks the validator as blocked or superminority; any failure shows the tab.
- Backend transaction relay (`POST /api/transaction/send`), used by the JPool tab.
- JPool tab art for the dark and light themes.

### Changed

- `tabs` accepts `jpool`; the defaults stay `native`, `blaze`, `vault`.
- Frontend and backend packages are at version `2.0.0`.

### Fixed

- The unselected Native tab showed the BlazeStake icon in the light theme.

## [1.1.0] - Unreleased

### Added

- Production Compose builder and hardened backend serving behind an HTTPS nginx `/api/` proxy, with loopback-only backend access and protected metrics.
- Public `DeepStakeWidget.mount()`, `unmount(element)`, and `version` API for static and delayed embeds; the legacy `MyWidget.mountDeepStakeWidgets()` entry point remains available.
- Persistent, daily-deduplicated mount telemetry with a protected statistics endpoint. Daily records expire after 32 days; the registry retains first and last UTC dates and the latest normalized event.
- Per-origin `deepstake:hide-other-network-alert` preference and a way to restore the balance warning.
- Migration of the legacy wallet-selection storage key to the current key while preserving existing selections.

### Changed

- Mainnet is the default widget network when neither embed options nor a build-time network is set. Devnet embeds must select devnet explicitly.
- Validator logos use Stakewiz first, then Validators.app, then a neutral fallback; the profile cache uses `validator-profile:v3`.
- Frontend and backend package names now identify DeepStake Widget, both at version `1.1.0`.

### Removed

- Trillium integration and related configuration.

### Compatibility and rollback

- Keep the legacy wallet-selection migration key during the compatibility window. Earlier bundles still use their older storage format.
- The new telemetry registry begins at deployment and cannot reconstruct earlier first-seen dates. Rolling daily records expire independently of registry entries.
- Rolling back to a previous deployment is supported by keeping older cache keys until their normal expiry; the v3 validator-profile namespace starts cold on this release.

The release date will be recorded when the version is tagged and published.
