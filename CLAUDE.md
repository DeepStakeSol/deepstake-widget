# deepstake-widget

Open-source embeddable Solana staking widget. Supports Native staking, BlazeStake (direct), and Vault (direct) — all in one interface.

## Architecture

Three services orchestrated with Docker Compose:

| Service | Path | Tech | Port |
|---|---|---|---|
| `frontend` | `frontend/` | React + Vite + TypeScript | 4173 |
| `backend` | `backend/` | Next.js API-only (Node) | 3000 |
| `staking-widget` | `staking-widget/` | Go HTTP server (embeds the widget) | 8443 |

The frontend is a **Vite** app — not Next.js. Ignore `next-env.d.ts` and `next.config.ts` in `frontend/`; they are leftover boilerplate.

The backend serves only API routes (no pages). CORS is handled in `backend/middleware.ts`; allowed origin is `APP_URL` env var.

## Frontend (`frontend/`)

### File conventions
- `src/hooks/` — custom React hooks, `use…` prefix, `.tsx`
- `src/components/` — PascalCase filenames; stake-specific UI under `src/components/stake/`
- `src/utils/` — pure utilities; Solana-specific under `src/utils/solana/`
- `src/context/` — React context providers
- `src/options.tsx` — embeddable widget config (injected via `data-options` attribute on `#root`)

### Key files
- `src/main.tsx` — entry point; reads `data-options` JSON from `#root`, calls `setOptions()`, bootstraps React
- `src/App.tsx` — root component; tabs for Native / BlazeStake / Vault staking
- `src/utils/api.ts` — centralized helpers for all backend API calls
- `src/utils/config.ts` — network resolution, explorer URL helpers
- `src/utils/constants.ts` — Solana program addresses, lamport constants, compute unit limits
- `src/utils/network.ts` — `NetworkType = "mainnet" | "devnet"`
- `src/context/NetworkContext.tsx` — global network state; additional contexts: `BalanceCheckContext`, `SelectedWalletAccountContext`, `StakingModalContext`

### Styling
- Tailwind CSS + Radix UI Themes
- Dark mode: set `data-theme="dark"` on `#root`; light is default
- Minimal custom CSS in `src/App.css` and `src/components/stake/table.css`

### Environment variables (`VITE_` prefix)
- `VITE_NEXT_PUBLIC_NETWORK_ENV` — `"mainnet"` | `"devnet"` (defaults to `"devnet"`)
- `VITE_BACKEND_URL` — URL of the backend service

### Package management
Use **npm** (`package-lock.json` present). Build: `npm run build`. Dev: `npm run dev`.

### Build helpers
- `build_run.sh` — convenience script for containerized builds
- `Dockerfile` — Docker image for the frontend

## Backend (`backend/`)

Next.js app used **only** for API routes under `app/api/`.

### API endpoints
| Route | Method | Description |
|---|---|---|
| `/api/balance` | GET | SOL balance for a wallet address |
| `/api/dstInfo` | GET | DST (DeepStake Token) metadata |
| `/api/stake/fetch` | GET | Fetch stake accounts for a wallet |
| `/api/stake/generate` | POST | Build native stake transaction |
| `/api/stake/get-epoch-info` | GET | Current epoch info |
| `/api/stake/get-perf-samples` | GET | Performance samples (avg slot time) |
| `/api/stake/get-validator-info` | GET | Validator metadata and logo |
| `/api/transaction/confirm` | POST | Submit/confirm transaction |
| `/api/trillium` | GET | Trillium info; `/api/trillium/rewards` subroute |
| `/api/unstake/generate` | POST | Build unstake transaction |
| `/api/vbalance` | GET | Vault token balance |
| `/api/vstake` | POST | Build Vault stake transaction |
| `/api/withdraw/generate` | POST | Build stake withdrawal transaction |

### Key utils (`backend/utils/`)
- `errors.tsx` — `ValidatorStakingError` class and `getErrorMessage` helper; API routes catch this for structured error responses
- `solana/` — RPC connection, balance, stake account helpers (`address.ts`, `balance.ts`, `rpc.ts`, `status.ts`, `stake/`)
- `config.ts` / `constants.ts` / `consts.ts` — environment config and constants
- `stakeInstruction.ts` / `stakePool.ts` / `depositSol.ts` — native and pool stake transaction builders
- `dstFetch.ts` / `metadataFetch.ts` — DST token metadata fetching
- `priorityFee.ts` — compute budget / priority fee helpers

`middleware.ts` is at `backend/middleware.ts` (root level) — handles CORS and API-only request filtering.

### Environment variables
- `APP_URL` — allowed CORS origin (frontend URL)
- `NODE_ENV` — `"development"` | `"production"`

## staking-widget (`staking-widget/`)

Go HTTP server (TLS on `:8443`) that serves the compiled widget.

- `main.go` — entry point
- `server.crt` / `server.key` — TLS credentials (self-signed, dev use)
- `.env` — `WIDGET_URL` (URL of the frontend container)
- `Dockerfile` — Docker image

## Running locally

```bash
# Full stack (frontend + backend + Go server)
docker compose up

# Or with override (includes staking-widget service)
docker compose -f docker-compose.yaml -f docker-compose.override.yml up
```

## Coding conventions

- No comments unless the *why* is non-obvious.
- Validate only at system boundaries (user input, API params); trust internal invariants.
- Error handling: catch `ValidatorStakingError` in API routes and return structured JSON; let unexpected errors propagate to a 500.
- TypeScript strict mode; respect existing ESLint config.
- `.bac` files are backups — do not edit.
- `patches/` directory patches a third-party package — do not modify manually.
