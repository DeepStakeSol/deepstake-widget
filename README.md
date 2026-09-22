# DeepStake Widget

Open-source embeddable Solana staking widget for validators.

DeepStake Widget is a JavaScript widget that can be embedded on a validator website with a single script tag. It gives delegators a staking interface without sending them away from the validator site.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

## Quick start for validators

There are two ways to put the widget on your site.

### Variant A: use the hosted backend (fastest)

DeepStake hosts the backend and widget bundle. You only add a snippet to your page.

1. Paste this snippet where the widget should appear:

```html
<div data-widget="deepstake" data-options='{
  "vote_account": "YOUR_VALIDATOR_VOTE_ACCOUNT",
  "theme": "dark",
  "network": "mainnet",
  "tabs": ["native", "blaze", "vault"]
}'></div>
<script src="https://deepstake.info/api/w/widget.iife.js"></script>
```

2. Replace `YOUR_VALIDATOR_VOTE_ACCOUNT` with your vote account address, not the validator identity address.
3. Keep only the tabs you want. Enable `blaze` and `vault` only when your validator is eligible for BlazeStake CLS and The Vault direct stake.
4. Open the page over HTTPS and check that your validator name, commission, and APY appear.

When omitted, `theme` defaults to `dark`, `network` defaults to `mainnet`, and `tabs` defaults to all tabs supported on the resolved network. Invalid configuration renders a visible error instead of a blank area and logs the reason with the `[DeepStake widget]` prefix.

Each valid widget instance sends one anonymous event when it mounts. See [Widget Mount Telemetry](#widget-mount-telemetry). Add `"telemetry": false` to the options to opt out.

### Variant B: self-host the backend and the bundle

Use this option for full control and no runtime dependency on `deepstake.info`.

1. Clone the repository and copy the root, backend, and frontend environment examples as described below.
2. Set the RPC endpoints and public backend URL under [Environment Variables](#environment-variables).
3. Build and start the stack using [Installation](#installation).
4. Put nginx in front of the backend on your HTTPS domain using [Production Deployment Behind Nginx](#production-deployment-behind-nginx).
5. Use the Variant A snippet with `https://your-domain.example/api/w/widget.iife.js` as the script URL.

## Features

- Native Solana staking: stake, unstake, and withdraw.
- BlazeStake directed liquid staking.
- Vault directed liquid staking.
- Wallet connection through Solana wallet-standard compatible wallets.
- Validator information display.
- Light and dark themes.
- IIFE frontend bundle that can be loaded from any HTML page.
- Next.js backend proxy for Solana RPC and supporting APIs.

## How It Works

```text
Validator website
  |
  | loads widget.iife.js
  v
DeepStake frontend widget
  |
  | calls backend API routes
  v
DeepStake backend
  |
  | calls Solana RPC and external data providers
  v
Solana / protocol APIs
```

The backend is required because several Solana RPC and protocol calls should not be made directly from the browser. In the Docker setup, the frontend build is written to `./shared`, and the backend serves that folder under `/api/w/`.

## Requirements

- Node.js 20+
- npm
- Docker and Docker Compose
- A Solana RPC endpoint for each network you want to support
- A validator vote account address
- A real domain with a valid HTTPS certificate for any production page that hosts the widget and for a self-hosted backend; do not use a bare IP address or self-signed certificate in production

HTTPS on a real domain avoids wallet heuristic warnings, transactions expiring while a user is still approving them, and mixed-content blocking in Firefox. `localhost` and a self-signed certificate are fine for local development.

## Installation

Clone the repository:

```bash
git clone https://github.com/DeepStakeSol/deepstake-widget.git
cd deepstake-widget
```

Create the root environment file used by `docker-compose.yaml`:

```bash
cp .env.example .env
```

Add the frontend deployment settings to `.env`:

```env
VITE_BACKEND_URL=http://localhost:3000
DISABLE_BACKEND_PREFIX=false
IMAGE_URL_PREFIX=
VITE_TELEMETRY_ENDPOINT=http://localhost:3000/api/telemetry
```

Create the backend environment file:

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env`:

```env
DEVNET_RPC_ENDPOINT=https://api.devnet.solana.com/
MAINNET_RPC_ENDPOINT=https://your-mainnet-rpc.example
NEXT_PUBLIC_NETWORK_ENV=mainnet
NEXT_PUBLIC_VALIDATOR_ADDRESS=YOUR_VALIDATOR_VOTE_ACCOUNT
VALIDATORS_APP_TOKEN=
```

Start the services:

```bash
docker-compose up --build
```

The services run on:

- Frontend preview: `http://localhost:4173`
- Backend API: `http://localhost:3000`
- Widget bundle through backend: `http://localhost:3000/api/w/widget.iife.js`

## Embedding the Widget

Add a root element and script tag to the page where the widget should appear:

```html
<div
  id="root"
  data-widget="deepstake"
  data-options='{
    "vote_account": "YOUR_VALIDATOR_VOTE_ACCOUNT",
    "theme": "light",
    "network": "mainnet",
    "tabs": ["native", "blaze", "vault"]
  }'
></div>

<script src="http://localhost:3000/api/w/widget.iife.js"></script>
```

For production, replace the script URL with your public backend URL:

```html
<script src="https://your-domain.example/api/w/widget.iife.js"></script>
```

### Widget Options

`data-options` is JSON. Currently supported fields:

| Field | Required | Values | Description |
| --- | --- | --- | --- |
| `vote_account` | Yes | Solana vote account address | Validator vote account that native staking targets. |
| `theme` | No | `light`, `dark` | Widget theme. Defaults to `dark`. Unknown values also fall back to `dark`. |
| `network` | No | `mainnet`, `devnet` | Solana cluster used by API calls, wallet chain checks, and explorer links. Overrides `VITE_NEXT_PUBLIC_NETWORK_ENV`. |
| `tabs` | No | `native`, `blaze`, `vault` | Top-level staking tabs to show. Defaults to all tabs supported by the selected network. |
| `telemetry` | No | `true`, `false` | Mount telemetry is enabled by default. Set to `false` to opt out. |
| `validator_name` | No | String | Overrides the validator name returned by the backend profile. |
| `validator_description` | No | String | Overrides the validator description returned by the backend profile. |
| `validator_logo_url` | No | HTTPS or local image URL | Overrides the validator logo returned by the backend profile. |

Vault is mainnet-only. On devnet, the widget hides Vault and logs a warning. A devnet configuration that explicitly enables only Vault is rejected as invalid.

Example:

```html
<div
  id="root"
  data-options='{
    "vote_account": "DeEpSdaw8uBLQ5T2HQhDf8fBSVbm13jGqJwoSF3HTpL5",
    "theme": "dark",
    "network": "devnet",
    "tabs": ["native", "blaze"],
    "validator_name": "Your Validator",
    "validator_description": "Validator description managed by the host page.",
    "validator_logo_url": "https://your-domain.example/validator-logo.png"
  }'
></div>
```

### React, Next.js and other single-page apps

The script mounts every `data-widget="deepstake"` element that exists when it runs. It also mounts correctly when the script is injected after page load. For components added later by route changes or conditional rendering, call `window.DeepStakeWidget.mount()`; it mounts new elements and skips elements already mounted.

```tsx
"use client";

import { useEffect, useRef } from "react";

const SRC = "https://deepstake.info/api/w/widget.iife.js";

declare global {
  interface Window {
    DeepStakeWidget?: {
      mount(): void;
      unmount(element: HTMLElement): void;
      version: string;
    };
  }
}

export function DeepStakeWidget() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    if (window.DeepStakeWidget) {
      window.DeepStakeWidget.mount();
    } else if (!document.querySelector(`script[src="${SRC}"]`)) {
      const script = document.createElement("script");
      script.src = SRC;
      script.async = true;
      document.body.appendChild(script);
    }

    return () => window.DeepStakeWidget?.unmount(element);
  }, []);

  return (
    <div
      ref={ref}
      data-widget="deepstake"
      data-options={JSON.stringify({
        vote_account: "YOUR_VALIDATOR_VOTE_ACCOUNT",
        theme: "dark",
        network: "mainnet",
        tabs: ["native", "blaze", "vault"],
      })}
    />
  );
}
```

JavaScript API exposed by the bundle:

| Call | What it does |
| --- | --- |
| `window.DeepStakeWidget.mount()` | Mounts every widget element not mounted yet; safe to call repeatedly. |
| `window.DeepStakeWidget.unmount(element)` | Unmounts one widget element. |
| `window.DeepStakeWidget.version` | Returns the loaded bundle's version string. |

The earlier `window.MyWidget.mountDeepStakeWidgets()` call remains supported.

### Widget Mount Telemetry

After a valid widget instance commits, it sends one best-effort
`widget_mount` event to `https://deepstake.info/api/telemetry`. The event
contains the host page's `location.hostname`, validator vote account, resolved
network, effective visible tabs, normalized theme, and widget build version.
It does not contain a wallet address. The application does not store the
request IP address, user agent, Referer, or other request headers.

Redis deduplicates mounts by hostname and vote account for each UTC day, so
mount totals are daily-deduplicated pairs rather than raw browser attempts.
Only the first normalized event for a pair is recorded each day. Daily event,
host, and vote-account records expire after 32 days. Set `"telemetry": false`
in `data-options` to disable the event for a widget instance.

Rolling 1-, 7-, and 30-day counts are available from the protected
`GET /api/telemetry/stats` endpoint. The opt-in `?detail=1` response adds
external host counts for each window and returns at most 1,000 registry entries,
sorted by last-seen date and identity. The endpoint requires a separate
`TELEMETRY_STATS_TOKEN` bearer token and is never cacheable.
`TELEMETRY_OWN_HOSTS` classifies configured domains and their subdomains as
development/own hosts at read time; it defaults to `deepstake.info` and is set
in the root Compose `.env`.

Besides daily counters, the backend keeps a persistent registry with one entry
per hostname and vote-account pair. Each entry contains the hostname, vote
account, network, visible tabs, theme, widget version, first and latest UTC
dates, and the latest normalized event. The registry begins at deployment and
does not reconstruct earlier first-seen dates. It has no expiry and never
contains wallet addresses, IP addresses, user agents, or other visitor data.
Authenticated `GET /api/telemetry/stats?detail=1` returns this registry subject
to the 1,000-entry response limit.

## Validator Profile Request

By default, the widget makes independent profile and logo requests through the backend:

```text
GET /api/validator/profile?network=<mainnet|devnet>&voteAccount=<vote-account>
GET /api/validator/logo?network=<mainnet|devnet>&voteAccount=<vote-account>
```

The profile response combines validator name, description, estimated APY, validator commission, and MEV data with field-level source and freshness metadata. Its schema retains `logoUrl`, but that field is always null and its metadata is empty. The logo response contains `network`, `voteAccount`, `logoUrl`, `status`, and `field` metadata. A partial or unavailable response does not disable staking. Widget identity overrides are applied after the backend responses.

When `REDIS_URL` is configured, the backend caches independent identity, logo, commission, APY, and MEV field groups. Fresh cache hits avoid provider requests. Stale values are returned immediately with `fields.<field>.stale=true` while one process refreshes them in the background. Valid cached fields are never replaced by null or malformed refresh values. Redis failures fall back to direct provider aggregation.

On a cold cache miss, the profile path returns a valid Stakewiz baseline while Solana RPC, Jito, and Validators.app continue in the background. The independent logo path starts Stakewiz and Validators.app concurrently. It returns a usable Stakewiz logo immediately; when Stakewiz has no logo, it uses Validators.app if available, otherwise the widget shows its neutral fallback. Stakewiz, Solana RPC, and Jito have 8-second request ceilings; Validators.app has a 5-second ceiling. Provider failures are logged with the provider ID, failure kind, elapsed time, and configured timeout. The cache namespace is `validator-profile:v3` for both group records and distributed locks. Deployment causes a controlled cold-cache refresh; old v2 keys expire naturally and remain available to the previous deployment.

Default cache windows:

| Field group | Fresh for | Stale fallback for |
| --- | --- | --- |
| Identity | 24 hours | 30 days |
| Logo | 24 hours | 30 days |
| Commission | 60 seconds | 15 minutes |
| Estimated APY | 15 minutes | 24 hours |
| MEV | 5 minutes | 48 hours (approximately one epoch) |

## Wallet Manage Data Cache

When `REDIS_URL` is configured, Native stake accounts, Blaze applied stakes, and Vault Manage responses are cached by the backend. The frontend retains only in-flight request deduplication for these datasets, so cached results survive page reloads and are shared across widget instances. SOL and LST balances keep their short frontend cache.

| Resource | Fresh window | Redis retention | Upstream |
| --- | --- | --- | --- |
| Native stake accounts | 2 minutes | 30 minutes | Solana RPC |
| Blaze applied stakes | 2 minutes | 30 minutes | SolBlaze |
| Vault Manage | 1 minute | 10 minutes | Solana RPC and Stakebot data |
| Vault Manage while `updating` | 10 seconds | 1 minute | Solana RPC and Stakebot data |

During the fresh window, Redis is returned without an upstream request. After freshness expires but before retention expires, stale data is returned immediately and one background refresh is coalesced per wallet/resource in each backend process. After retention expires, the request waits for upstream data. Empty arrays are valid cache entries. Redis connection, read, or write failures fall back to the live provider. Cache keys use the `wallet-data:v1` namespace.

The three read routes accept `refresh=true` to bypass a cached value and synchronously replace it:

`GET /api/stake/fetch?owner=<wallet>&network=<network>&refresh=true`

`GET /api/blaze/manage/applied-stakes?wallet=<wallet>&network=<network>&refresh=true`

`GET /api/blaze/manage/vault?wallet=<wallet>&network=<network>&refresh=true`

Vote-filtered Native stake-account requests remain uncached. Transaction confirmation accepts a typed `cacheMutation` context, waits for `confirmed` commitment, and invalidates the corresponding Redis entry. Native stake, unstake, and withdraw invalidate Native accounts; Blaze stake invalidates applied stakes; Vault stake invalidates Vault Manage. Each frontend mutation then performs one forced read. Blaze CLS registration is proxied through `POST /api/blaze/stake/register` and invalidates applied stakes again after SolBlaze accepts the registration. Invalidation and refresh failures are best-effort and do not turn an already confirmed transaction into a failed transaction.

See [the wallet cache runbook](ops/wallet-data-cache-runbook.md) for metrics and failure checks.

## Shared Folder and Widget Bundle

The Docker setup uses a repo-root `shared/` directory:

- Frontend mounts `./shared` as `/app/dist`.
- `npm run build` writes `widget.iife.js` into `/app/dist`.
- Backend mounts `./shared` as `/shared`.
- Backend serves `/shared` files at `/api/w/...`.

After a successful frontend build, this local file:

```text
shared/widget.iife.js
```

is available through the backend as:

```text
http://localhost:3000/api/w/widget.iife.js
```

You can verify it:

```bash
curl -i http://localhost:3000/api/w/widget.iife.js
```

The file server is read-only. It does not provide uploads or directory listings.

## Shared Images Folder

The Docker setup also uses a repo-root `images/` directory for widget image assets that should be served by the backend:

- Frontend mounts `./images` as `/images`.
- Backend mounts `./images` as `/images`.
- Backend serves `/images` files at `/api/images/...`.

For example, this local file:

```text
images/sol_logo.png
```

is available through the backend as:

```text
http://localhost:3000/api/images/sol_logo.png
```

You can verify it:

```bash
curl -i http://localhost:3000/api/images/sol_logo.png
```

## Environment Variables

### Root `.env`

Used by Docker Compose for frontend and backend container configuration.

| Variable | Example | Description |
| --- | --- | --- |
| `VITE_BACKEND_URL` | `http://localhost:3000` | Base URL used by the frontend when calling backend routes. |
| `DISABLE_BACKEND_PREFIX` | `false` | If `false`, frontend adds `/api` before backend routes. If `true`, frontend does not add `/api`. |
| `IMAGE_URL_PREFIX` | `https://your-domain.example/api` | Optional prefix for local `/images/...` widget assets loaded from the backend image file server. Leave empty for same-origin assets. |
| `METRICS_BEARER_TOKEN` | Random secret | Passed to the backend container to protect `/api/metrics`. |
| `VITE_TELEMETRY_ENDPOINT` | `https://deepstake.info/api/telemetry` | Absolute telemetry collector URL embedded into the widget build. Defaults to the listed production URL. |
| `VITE_WIDGET_VERSION` | Empty | Optional override. Leave empty in production so `frontend/package.json` supplies `1.1.0` to the browser API and telemetry. |
| `TELEMETRY_STATS_TOKEN` | Separate random secret | Passed to the backend container to protect `/api/telemetry/stats`. |
| `TELEMETRY_OWN_HOSTS` | `deepstake.info` | Comma-separated own hostnames, including their subdomains, for detailed telemetry classification. |
| `REDIS_URL` | Empty | Optional Compose override; empty uses `redis://redis:6379`. |

Default local setup:

```env
VITE_BACKEND_URL=http://localhost:3000
DISABLE_BACKEND_PREFIX=false
IMAGE_URL_PREFIX=
VITE_TELEMETRY_ENDPOINT=http://localhost:3000/api/telemetry
VITE_WIDGET_VERSION=
```

Production setup when nginx maps public `/api/` to backend port `3000`:

```env
VITE_BACKEND_URL=https://your-domain.example/api
DISABLE_BACKEND_PREFIX=true
IMAGE_URL_PREFIX=https://your-domain.example/api
VITE_TELEMETRY_ENDPOINT=https://deepstake.info/api/telemetry
VITE_WIDGET_VERSION=
REDIS_URL=
TELEMETRY_OWN_HOSTS=deepstake.info
METRICS_BEARER_TOKEN=YOUR_PRIVATE_METRICS_TOKEN
TELEMETRY_STATS_TOKEN=YOUR_DIFFERENT_PRIVATE_STATS_TOKEN
```

With that production setup, frontend calls become:

```text
https://your-domain.example/api/stake/fetch
https://your-domain.example/api/validator/profile?network=mainnet&voteAccount=YOUR_VALIDATOR_VOTE_ACCOUNT
https://your-domain.example/api/validator/logo?network=mainnet&voteAccount=YOUR_VALIDATOR_VOTE_ACCOUNT
https://your-domain.example/api/w/widget.iife.js
```

With `IMAGE_URL_PREFIX=https://your-domain.example/api`, local widget images are rewritten from:

```text
/images/sol_logo.png
```

to:

```text
https://your-domain.example/api/images/sol_logo.png
```

### Backend `.env`

Used by the Next.js backend.

| Variable | Required | Description |
| --- | --- | --- |
| `DEVNET_RPC_ENDPOINT` | For devnet | Solana devnet RPC URL. |
| `MAINNET_RPC_ENDPOINT` | For mainnet | Solana mainnet RPC URL. |
| `TESTNET_RPC_ENDPOINT` | For testnet | Solana testnet RPC URL, if using testnet. |
| `NEXT_PUBLIC_NETWORK_ENV` | No | Default network for backend helper URLs. |
| `NEXT_PUBLIC_VALIDATOR_ADDRESS` | Yes for backend validator helpers | Validator vote account used by backend-side helpers. |
| `VALIDATORS_APP_TOKEN` | No | Optional Validators.app API token. |
| `REDIS_URL` | Recommended | Redis connection URL for validator-profile and wallet-data caches. Without it, requests use direct providers with local in-flight coalescing. |
| `METRICS_BEARER_TOKEN` | Production | Bearer token required to scrape `/api/metrics`. Production returns 503 when it is unset. |
| `SHARED_FILES_DIR` | No | Filesystem path served by `/api/w/`; Docker sets this to `/shared`. |
| `TELEMETRY_STATS_TOKEN` | Yes for telemetry statistics | Separate bearer token required by `/api/telemetry/stats`; the endpoint returns 503 when unset. |
| `TELEMETRY_OWN_HOSTS` | No | Comma-separated own hostnames; defaults to `deepstake.info`. Compose reads it from the root `.env`. |
| `IMAGES_DIR` | No | Filesystem path served by `/api/images/`; Docker sets this to `/images`. |

`backend/.env` supplies RPC endpoints, validator address, and optional provider token to production Compose. Compose overrides Redis, token, telemetry-host, and filesystem-path settings from the root `.env` or its service configuration. For a direct backend run, `backend/.env` can supply those settings. `frontend/.env.example` lists optional browser-side network, RPC, and protocol overrides; Compose uses root `.env` for its build arguments.

## Observability

The backend exposes `GET /api/health` for container liveness and protected
Prometheus metrics at `GET /api/metrics`. Metrics cover validator-profile
status and latency, provider outcomes, validator and wallet cache operations, field freshness, and
background refreshes. Validator profile failures are logged as one-line JSON.

Prometheus/Grafana are managed outside this repository. Alert rules are in
`ops/prometheus/validator-profile-alerts.yml`; scrape configuration, failure
drills, rollback steps, and the 30-day legacy exit gate are documented in
`ops/validator-profile-runbook.md`.

Widget-adoption telemetry is intentionally separate from Prometheus backend
health metrics. This iteration does not add nginx Referer logging or Plausible forwarding.

## Network Selection

The widget network is resolved in this order:

1. `data-options.network`
2. `VITE_NEXT_PUBLIC_NETWORK_ENV`
3. `mainnet` default fallback

Use the widget option when one hosted bundle must support different validator pages or clusters:

```html
<div
  id="root"
  data-options='{
    "vote_account": "YOUR_VALIDATOR_VOTE_ACCOUNT",
    "network": "devnet"
  }'
></div>
```

If `network` is omitted, the frontend uses `VITE_NEXT_PUBLIC_NETWORK_ENV` when set; otherwise it uses `mainnet`. Set `network: "devnet"` explicitly for a devnet embed.

Make sure the backend has the matching RPC endpoint configured:

```env
DEVNET_RPC_ENDPOINT=https://api.devnet.solana.com/
NEXT_PUBLIC_NETWORK_ENV=devnet
```

## Production Deployment Behind Nginx

A common deployment is:

- nginx serves the public domain.
- nginx proxies `/api/` to the backend on `127.0.0.1:3000`.
- The widget script is loaded from `/api/w/widget.iife.js`.

Copy `.env.example` to the private root `.env` and `backend/.env.example` to the private `backend/.env`. Set the public HTTPS `VITE_BACKEND_URL`, its matching prefix setting, real RPC endpoints, validator vote account, and separate non-empty metrics and telemetry statistics tokens. Leave `VITE_WIDGET_VERSION=` empty. Keep both private files out of Git. Then build and start the production stack:

```bash
docker compose -f docker-compose.prod.yaml up -d --build --remove-orphans
```

The production Compose file:

- builds the widget into `./shared` with a one-shot `frontend-builder` service;
- starts the backend with `next start` and no source-code bind mount;
- serves `./shared` and `./images` through read-only mounts;
- publishes only the backend on `127.0.0.1:3000`;
- requires separate metrics and telemetry-statistics bearer tokens.

Frontend build variables and the two bearer tokens come from the root `.env`.
Backend RPC endpoints, the validator address, and the optional Validators.app
token come from `backend/.env`. The `frontend-builder` container exiting with
status `0` is expected after it writes the bundle.

Check the deployment with:

```bash
docker compose -f docker-compose.prod.yaml ps --all
curl -fsS http://127.0.0.1:3000/api/health
curl -I http://127.0.0.1:3000/api/w/widget.iife.js
curl -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/api/metrics
curl -o /dev/null -w '%{http_code}\n' 'http://127.0.0.1:3000/api/telemetry/stats?detail=1'
# Both protected requests above should return 401. Use private token values to check 200:
curl -H 'Authorization: Bearer YOUR_PRIVATE_METRICS_TOKEN' http://127.0.0.1:3000/api/metrics
curl -H 'Authorization: Bearer YOUR_DIFFERENT_PRIVATE_STATS_TOKEN' 'http://127.0.0.1:3000/api/telemetry/stats?detail=1'
```

Use an nginx prefix location that is not overridden by static `.js` regex locations:

```nginx
location ^~ /api/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host $host;

    proxy_read_timeout 60s;
    proxy_connect_timeout 5s;
}
```

Important details:

- Use `location ^~ /api/` so nginx does not handle `/api/w/widget.iife.js` as a static `.js` file.
- Use `proxy_pass http://127.0.0.1:3000;` without a trailing slash to preserve the `/api/...` path.
- If Cloudflare is in front of nginx, purge cached 404s or test with a cache-busting query string.

After editing nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Test from the VPS:

```bash
curl -i http://127.0.0.1:3000/api/w/widget.iife.js
curl -k -i --resolve your-domain.example:443:127.0.0.1 https://your-domain.example/api/w/widget.iife.js
curl -i "https://your-domain.example/api/w/widget.iife.js?v=1"
```

The development Docker Compose binds the backend and frontend preview ports to the VPS
loopback interface. Do not change these bindings to `0.0.0.0`: public traffic
must reach the backend through nginx, and the preview server is not a
production entry point.

The explicit `-f docker-compose.prod.yaml` command excludes the development override. Development Compose uses loopback-only ports; never publish those ports publicly.

For temporary access to both services from a local machine, use an SSH tunnel:

```bash
ssh -L 4173:127.0.0.1:4173 -L 3000:127.0.0.1:3000 <user>@<VPS_IP>
```

The tunneled backend is available locally on port `3000`. Port `4173` is available only when the development frontend preview service is running; production Compose has no preview service.
Keep `METRICS_BEARER_TOKEN` and `TELEMETRY_STATS_TOKEN` in the private VPS
environment; do not commit them or share them in group chats.

## Local Development Without Docker

Install dependencies:

```bash
cd backend
npm ci

cd ../frontend
npm ci
```

Run the backend:

```bash
cd backend
npm run dev
```

Run the frontend dev server in another terminal:

```bash
cd frontend
npm run dev
```

HTTPS for `vite preview` is optional. Vite enables it only when both
`frontend/.cert/server.key` and `frontend/.cert/server.crt` exist. One way to
create a local self-signed pair is:

```bash
mkdir -p frontend/.cert
openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
  -keyout frontend/.cert/server.key \
  -out frontend/.cert/server.crt \
  -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
```

Without both files, `npm run build` and `npm run preview` use the normal HTTP
configuration and require no certificate setup.

For local non-Docker development, remember that the frontend dev server does not automatically populate the backend shared folder. For the embeddable bundle flow, build the frontend:

```bash
cd frontend
npm run build
```

Then copy `frontend/dist/widget.iife.js` into the `SHARED_FILES_DIR` directory (the example uses `../shared` relative to `backend/`).

## Useful Commands

Build frontend:

```bash
cd frontend
npm run build
```

Run frontend typecheck:

```bash
cd frontend
npm run typecheck
```

Run backend:

```bash
cd backend
npm run dev
```

Check the widget bundle through backend:

```bash
curl -i http://localhost:3000/api/w/widget.iife.js
```

## Troubleshooting

### `404 Not Found` for `/api/w/widget.iife.js`

Check backend directly:

```bash
curl -i http://127.0.0.1:3000/api/w/widget.iife.js
```

If direct backend works but the public domain returns nginx 404, nginx is not proxying the route. Use `location ^~ /api/` and remove the trailing slash from `proxy_pass`.

### Frontend calls `/api/api/...`

This usually means both the base URL and the frontend route prefix include `/api`.

Use one of these setups:

```env
VITE_BACKEND_URL=https://your-domain.example
DISABLE_BACKEND_PREFIX=false
```

or:

```env
VITE_BACKEND_URL=https://your-domain.example/api
DISABLE_BACKEND_PREFIX=true
```

### Wrong network

Check `data-options.network` first. It has priority over `VITE_NEXT_PUBLIC_NETWORK_ENV`. Also make sure backend `NEXT_PUBLIC_NETWORK_ENV` and the RPC endpoint variables support the selected network.

### Restore the other-network balance warning

The “Don't show this again” choice is stored by the embedding site in `localStorage` under `deepstake:hide-other-network-alert`. The choice is scoped to the embedding page's origin. To restore the warning on that origin, run `localStorage.removeItem("deepstake:hide-other-network-alert")` in its browser console.

### CORS errors

The backend answers widget-facing `/api/*` routes and preflight requests with
`Access-Control-Allow-Origin: *`. This is intentional because third-party
validator domains must be able to call the backend. `/api/metrics` is handled
separately, and protected routes still require their bearer tokens. If a CORS
error appears, verify that the request reaches the backend. Check the nginx
`location ^~ /api/`, Cloudflare rules, and whether a proxy-generated 404 or 502
response lacks CORS headers instead of restricting the allowed origin.

### The widget does not appear on a React / Next.js page

Use the component under [React, Next.js and other single-page apps](#react-nextjs-and-other-single-page-apps). A plain `<script>` element inside JSX is not executed by React.

### Browser storage used by the widget

The widget stores two small values in the embedding page's origin-scoped
`localStorage`:

| Key | Meaning |
| --- | --- |
| `deepstake:selected-wallet` | Last selected wallet, used to restore the selection after a reload. |
| `deepstake:hide-other-network-alert` | Set to `1` when the user selects “Don't show this again” in the “Balance Found on Another Network” dialog; delete the key to show the dialog again. |

No other current widget data is stored in the browser, and the widget continues
to work when `localStorage` is unavailable. During wallet-key migration, an
older `qn-solana-staking:selected-wallet-and-address` value may be read and
moved to `deepstake:selected-wallet`.

## Project Structure

```text
deepstake-widget/
  backend/             Next.js backend and API routes
  frontend/            React + Vite widget bundle
  images/              Runtime image assets served by backend /api/images/
  shared/              Runtime build output served by backend /api/w/
  docker-compose.yaml  Local Docker setup
```

## Status

This project is under active development.

Current state:

- [x] Native staking
- [x] BlazeStake directed staking
- [x] Vault directed staking
- [x] Dark and light themes
- [x] Widget embedding through an IIFE script
- [x] Backend-served widget bundle from shared disk
- [x] Production server hardening
- [ ] Expanded configuration options
- [ ] Additional protocol integrations

## About DeepStake

DeepStake is a Solana mainnet validator focused on simple staking for everyone.

- **Validator:** `DeEpSdaw8uBLQ5T2HQhDf8fBSVbm13jGqJwoSF3HTpL5`
- **Website:** [deepstake.info](https://deepstake.info)
- **X:** [@DeepStakeSol](https://x.com/DeepStakeSol)

## Contributing

This project is open-source under the MIT license. Contributions, feedback, and feature requests are welcome.

## License

[MIT](LICENSE)
