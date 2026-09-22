# DeepStake backend

Next.js serves the widget API routes in `app/api/`. It has no backend-rendered UI.

## Local setup

Use Node.js 20.19.0 or newer. Run `npm ci` in this directory, configure the RPC endpoints in `.env`, then run `npm run dev`. The service listens on port 3000.

```env
DEVNET_RPC_ENDPOINT=https://example.solana-devnet.quiknode.pro/12345/
MAINNET_RPC_ENDPOINT=https://example.solana-mainnet.quiknode.pro/12345/
```

`GET /api/health` is the liveness endpoint. See the repository README and `ops/validator-profile-runbook.md` for deployment, profile caching, and metrics.
