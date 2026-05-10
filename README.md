# DeepStake Widget

Open-source embeddable Solana staking widget for validators.

DeepStake Widget is a JavaScript widget that can be embedded on a validator website with a single script tag. It gives delegators a staking interface without sending them away from the validator site.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

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

## Installation

Clone the repository:

```bash
git clone https://github.com/DeepStakeSol/deepstake-widget.git
cd deepstake-widget
```

Create the root environment file used by `docker-compose.yaml`:

```bash
touch .env
```

Add the frontend deployment settings to `.env`:

```env
VITE_BACKEND_URL=http://localhost:3000
DISABLE_BACKEND_PREFIX=false
IMAGE_URL_PREFIX=
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
    "network": "mainnet"
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
| `theme` | No | `light`, `dark` | Widget theme. Defaults to `light`. |
| `network` | No | `mainnet`, `devnet` | Solana cluster used by API calls, wallet chain checks, and explorer links. Overrides `VITE_NEXT_PUBLIC_NETWORK_ENV`. |

Example:

```html
<div
  id="root"
  data-options='{
    "vote_account": "DeEpSdaw8uBLQ5T2HQhDf8fBSVbm13jGqJwoSF3HTpL5",
    "theme": "dark",
    "network": "devnet"
  }'
></div>
```

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

Used by Docker Compose for the frontend container.

| Variable | Example | Description |
| --- | --- | --- |
| `VITE_BACKEND_URL` | `http://localhost:3000` | Base URL used by the frontend when calling backend routes. |
| `DISABLE_BACKEND_PREFIX` | `false` | If `false`, frontend adds `/api` before backend routes. If `true`, frontend does not add `/api`. |
| `IMAGE_URL_PREFIX` | `https://your-domain.example/api/images` | Optional prefix for local `/images/...` widget assets loaded from the backend image file server. Leave empty for same-origin assets. |

Default local setup:

```env
VITE_BACKEND_URL=http://localhost:3000
DISABLE_BACKEND_PREFIX=false
IMAGE_URL_PREFIX=
```

Production setup when nginx maps public `/api/` to backend port `3000`:

```env
VITE_BACKEND_URL=https://your-domain.example/api
DISABLE_BACKEND_PREFIX=true
IMAGE_URL_PREFIX=https://your-domain.example/api/images
```

With that production setup, frontend calls become:

```text
https://your-domain.example/api/stake/fetch
https://your-domain.example/api/w/widget.iife.js
```

With `IMAGE_URL_PREFIX=https://your-domain.example/api/images`, local widget images are rewritten from:

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
| `APP_URL` | Recommended in production | Allowed CORS origin for `/api/*`; defaults to `http://localhost:8080`. |
| `SHARED_FILES_DIR` | No | Filesystem path served by `/api/w/`; Docker sets this to `/shared`. |
| `IMAGES_DIR` | No | Filesystem path served by `/api/images/`; Docker sets this to `/images`. |

## Network Selection

The widget network is resolved in this order:

1. `data-options.network`
2. `VITE_NEXT_PUBLIC_NETWORK_ENV`
3. frontend default fallback

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

If `network` is omitted, the frontend uses:

```env
VITE_NEXT_PUBLIC_NETWORK_ENV=devnet
```

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

## Local Development Without Docker

Install dependencies:

```bash
cd backend
npm install

cd ../frontend
npm install
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

For local non-Docker development, remember that the frontend dev server does not automatically populate the backend shared folder. For the embeddable bundle flow, build the frontend:

```bash
cd frontend
npm run build
```

Then serve the generated bundle from the location configured by `SHARED_FILES_DIR`.

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

### CORS errors

Set backend `APP_URL` to the origin of the website embedding the widget:

```env
APP_URL=https://your-domain.example
```

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
- [ ] Full production hardening
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
