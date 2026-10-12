# Changelog

All notable changes to DeepStake Widget are documented here. This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Security

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
