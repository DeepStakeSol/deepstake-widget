# Workspace instructions for AI coding assistants

This is the **frontend** sub-package of the `deepstake-widget` monorepo. See `/CLAUDE.md` at the repo root for the full architecture overview.

## This package

React + Vite + TypeScript embeddable Solana staking widget. **Not a Next.js app** — ignore `next-env.d.ts` and `next.config.ts`.

## Conventions

- Hooks → `src/hooks/`, `use…` prefix
- Components → `src/components/`, PascalCase filenames; stake UI under `src/components/stake/`
- Utilities → `src/utils/`, Solana helpers under `src/utils/solana/`
- Contexts → `src/context/`
- Env vars use `VITE_` prefix (see `.env`)
- Tailwind CSS + Radix UI Themes for styling; dark mode via `data-theme="dark"` on `#root`
- Package manager: **npm**
- `.bac` files are backups — do not edit
- `patches/` directory — do not modify manually

## Staking modes

Three tabs in `App.tsx`: Native staking (`StakeForm`), BlazeStake direct (`StakeFormBlaze`), Vault direct (`StakeFormVault2`).

## Key entry points

- `src/main.tsx` — bootstraps React, reads `data-options` from `#root`
- `src/options.tsx` — `Options` type and `getOptions()` / `setOptions()`
- `src/App.tsx` — root component
- `src/utils/config.ts` — network + explorer URL helpers
- `src/utils/constants.ts` — Solana addresses and numeric constants
