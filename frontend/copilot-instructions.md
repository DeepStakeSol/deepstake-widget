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

Three tabs in `App.tsx`:
- **Native staking** — `StakeForm`; stake/unstake/withdraw native SOL to a validator
- **BlazeStake direct** — `StakeFormBlaze`; deposit SOL into BlazeStake pool for bSOL
- **Vault direct** — `StakeFormVault2`; deposit SOL into Vault for vSOL, with `VaultBindingBlock` showing vault manage status

## Key entry points

- `src/main.tsx` — bootstraps React, reads `data-options` from `#root`
- `src/options.tsx` — `Options` type and `getOptions()` / `setOptions()`
- `src/App.tsx` — root component; tab images use `/images/{tab}_stake[_selected][_dk].png`
- `src/utils/api.ts` — all backend API calls; key exports: `fetchStakeAccounts`, `fetchEpochInfo`, `fetchPerfSamples`, `generateStakeTransaction`, `generateUnstakeTransaction`, `generateWithdrawTransaction`, `fetchVaultManage`
- `src/utils/config.ts` — network + explorer URL helpers
- `src/utils/constants.ts` — Solana program addresses and numeric constants
- `src/utils/errors.tsx` — `ValidatorStakingError` class, `createStakingError` factory, `getErrorMessage` (renders wallet-standard errors too)
- `src/utils/styles.ts` — shared inline style objects (`centerFlex`, `dialogContentBase`, `mt8`, etc.)
- `src/utils/stakeAccountsCache.ts` — TTL-based in-memory cache for stake accounts (5-minute TTL); exports `getCachedStakeAccounts`, `setCachedStakeAccounts`, `invalidateStakeAccountsCache`
- `src/utils/network.ts` — `NetworkType = "mainnet" | "devnet"`

## Hooks

- `src/hooks/useStakeForm.tsx` — shared form state for all three staking modes (wallet, balance, amount, network)
- `src/hooks/useStakeTransaction.tsx` — transaction signing + confirmation logic
- `src/hooks/useIsWalletConnected.tsx` — thin wrapper returning boolean wallet connection state

## Context

- `src/context/NetworkContext.tsx` — global `network` state + `useNetwork()` hook
- `src/context/SelectedWalletAccountContext.tsx` — currently selected wallet account
- `src/context/SelectedWalletContextProvider.tsx` — provider wiring wallet-standard adapter
- `src/context/BalanceCheckContext.tsx` + `BalanceCheckProvider.tsx` — triggers balance refresh after transactions
- `src/context/StakingModalContext.tsx` — controls global staking modal open/close state

## Solana utils (`src/utils/solana/`)

- `validator.ts` — `fetchValidatorInfo()` / `fetchValidatorLogo()` / `ValidatorInfoResponse`
- `blaze.ts` — BlazeStake pool helpers
- `price.ts` — SOL price fetching
- `rpc.ts`, `balance.ts`, `address.ts`, `status.ts` — low-level RPC helpers
- `stake/` — stake account parsing: `get-stake-accounts.ts`, `stake-filters.ts`, `stake-instructions.ts`, `struct.ts`

## Vault manage feature (`VaultBindingBlock`)

`StakeFormVault2` fetches `GET /api/blaze/manage/vault?wallet=…&network=…` (→ `fetchVaultManage` in `api.ts`) and passes the result to `VaultBindingBlock`. The block renders four UI scenarios driven by `uiStatus`:

| `uiStatus` | Left cell | Right cell |
|---|---|---|
| `ready` | Validator name + vSOL balance | `generatedStake` SOL |
| `updating` | Validator name + vSOL balance | Info message (data updating) |
| `low_balance` | vSOL balance | Warning (below 1 vSOL threshold) |
| `no_binding` | "NOT DIRECT STAKED" + balance | — |
| `error` | balance | Error message |

`VaultManageResponse` type is in `src/utils/api.ts`.

## Stake components (`src/components/stake/`)

- `StakeForm.tsx` / `StakeFormBlaze.tsx` / `StakeFormVault2.tsx` — top-level tab forms
- `StakeLayout.tsx` — shared wrapper with padding/card
- `StakeInputSection.tsx` — amount input + MAX button
- `StakeButtonBase.tsx` / `StakeButton.tsx` / `StakeButtonBlaze.tsx` / `StakeButtonVault2.tsx` — submit buttons per mode
- `StakeSuccessModal.tsx` / `StakeBlazeSuccessModal.tsx` / `StakeVaultSuccessModal.tsx` — post-stake modals
- `UnstakeButton.tsx` / `UnstakeSuccessModal.tsx` / `WithdrawButton.tsx` / `WithdrawSuccessModal.tsx` — unstake/withdraw actions (Native mode)
- `StakeAccountsTable.tsx` / `NoAccountsTable.tsx` / `NoWalletTable.tsx` — stake account list states
- `BSOLBalanceTable.tsx` / `BSOLBalanceTable2.tsx` — bSOL balance display variants
- `VSOLBalanceTable.tsx` — vSOL balance display
- `VaultBindingBlock.tsx` — vault manage status block (see above)
- `ValidatorInfo.tsx` — validator card shown above tabs
- `WalletBalance.tsx` / `WalletInfo.tsx` — wallet info row

## Backend routes (for reference)

The relevant new route added for Vault manage:
- `GET /api/blaze/manage/vault?wallet=&network=` — aggregates on-chain vault binding (PDA `DStkUE3DjxBhVwEGNzv89eni1p7LpYuHSxxm1foggbEv`), vSOL wallet balance, and stakebot data from `github.com/SolanaVault/stakebot-data`; implemented via `backend/utils/vaultBinding.ts` and `backend/utils/stakebot.ts`
