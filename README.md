# DeepStake Widget

Open-source embeddable Solana staking widget for validators.

Native staking + BlazeStake + Vault + more -- in one interface, on your website.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

## What is this?

DeepStake Widget is a JavaScript widget that any Solana validator can embed on their website. It gives delegators a complete staking experience without leaving the validator's page.

**One script tag. Your vote account. Multiple staking methods.**

### Supported staking methods

- **Native staking** -- stake, unstake, withdraw SOL directly to a validator
- **BlazeStake CLS** -- directed liquid staking through BlazeStake (bSOL)
- **Vault direct staking** -- directed liquid staking through Vault (vSOL)
- More protocols and DeFi strategies coming

### Features

- Wallet connection (Phantom, Solflare, and others via Solana Wallet Adapter)
- Stake account management (view, unstake, withdraw)
- Validator info display (name, APY, commission, MEV commission)
- Dark and light themes
- Configurable tabs (show/hide staking methods)
- Customizable labels
- Validator eligibility checks per protocol
- Embeddable as a single JS file (IIFE bundle)

## Quick start

Add the widget to any HTML page:

```html
<div id="root" data-widget="deepstake" data-options='{
  "vote_account": "YOUR_VALIDATOR_VOTE_KEY",
  "theme": "dark",
  "tabs": ["native", "blaze", "vault"]
}'></div>
<script src="https://YOUR_HOST/widget.iife.js"></script>
```

Two deployment options are available:

| Option | What you host | Best for |
|--------|--------------|----------|
| **Hosted** | Frontend script only | Quick setup, no backend needed |
| **Self-hosted** | Frontend + backend + Docker | Full control, custom RPC |

> Documentation for both options is coming soon.

## Running locally

> This section will be expanded. For now, the basic steps:

### Prerequisites

- Node.js
- Docker and Docker Compose

### Setup

```bash
git clone https://github.com/DeepStakeSol/deepstake-widget.git
cd deepstake-widget
```

Copy the environment template and fill in required values:

```bash
cp .env.example .env
```

Start all services:

```bash
docker-compose up
```

The widget will be available at `http://localhost:PORT`.

> Detailed setup instructions and environment variable reference are in progress.

## Architecture

```
Your website
  |
  <script> tag loads widget.iife.js
  |
  Widget (React IIFE bundle)
  |--- Native staking --> Solana RPC (via backend proxy)
  |--- BlazeStake ------> BlazeStake API + Solana RPC
  |--- Vault ------------> Vault API + Solana RPC
  |
  Backend proxy server (Next.js)
  |
  Solana mainnet / devnet RPC
```

The backend proxy is required because Solana mainnet RPC blocks direct browser requests (CORS/403). All RPC calls go through the proxy.

## Tech stack

- **Frontend:** React, Vite (IIFE library build)
- **Backend:** Next.js (RPC proxy)
- **Wallet:** Solana Wallet Adapter
- **Solana:** @solana/web3.js, @solana/kit
- **Deployment:** Docker, Docker Compose
- **Data sources:** On-chain RPC, StakeWiz API, Marinade API (fallback)

## Project structure

```
deepstake-widget/
  frontend/          # React widget (Vite IIFE bundle)
  backend/           # Next.js RPC proxy server
  docker-compose.yaml
```

## Status

This project is under active development as part of the [Solana Frontier Hackathon](https://colosseum.com/frontier) (April 6 - May 11, 2026).

Current state:
- [x] Native staking (stake / unstake / withdraw)
- [x] BlazeStake CLS integration
- [x] Vault direct staking integration
- [x] Dark and light themes
- [x] Validator eligibility checks
- [x] Widget embedding via script tag
- [ ] Landing page and documentation
- [ ] Manage view for liquid staking positions
- [ ] Mobile responsive design
- [ ] Additional protocol integrations

## About DeepStake

DeepStake is a Solana mainnet validator focused on simple, safe staking for everyone.

- **Validator:** `DeEpSdaw8uBLQ5T2HQhDf8fBSVbm13jGqJwoSF3HTpL5`
- **Website:** [deepstake.info](https://deepstake.info)
- **X:** [@DeepStakeSol](https://x.com/DeepStakeSol)

## Contributing

This project is open-source under the MIT license. Contributions, feedback, and feature requests are welcome.

## License

[MIT](LICENSE)
