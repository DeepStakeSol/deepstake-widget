# Changelog

All notable changes to DeepStake Widget are documented here. This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
