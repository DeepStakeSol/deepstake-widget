# Solana SDK Compatibility Baseline

Recorded for Phase 0 of the Solana Kit consolidation.

## Compatibility contract

- Public widget tabs remain `native`, `blaze`, and `vault`.
- Native generation endpoints return `{ "wireTransaction": "<base64>" }`.
- Blaze and Vault generation endpoints return `{ "transaction": "<base64>" }`.
- Native and Vault transactions are version 0; Blaze transactions are legacy.
- Wallet discovery and signing continue through Wallet Standard and `@solana/react`.
- Network selection, priority-fee estimation, simulation, transaction confirmation,
  and wallet-data cache invalidation are behaviorally stable migration boundaries.

The executable ABI fixture is
`backend/test/fixtures/solana-compatibility.json`. It locks the program address,
PDA, account order, signer/writable role, and instruction bytes used for:

- Native initialize, delegate, deactivate, and withdraw.
- Blaze associated-token-account creation and Stake Pool `DepositSol`.
- Vault director initialization, director target update, and DST minting.

## SDK inventory

Resolved versions:

- Frontend: `@solana/kit@2.3.0`, `@solana/web3.js@1.98.4`.
- Backend: direct `@solana/kit@2.3.0`.
- Backend web3.js is not declared directly despite authored imports; it currently
  resolves transitively to `@solana/web3.js@1.95.8`.

Authored import sites at baseline:

| Package           | Frontend | Backend, including compatibility test |
| ----------------- | -------: | ------------------------------------: |
| `@solana/kit`     |       15 |                                    26 |
| `@solana/web3.js` |        2 |                                    19 |

The compatibility test intentionally imports both SDKs until the migration is
complete. Its imports are test-only and provide the cross-SDK golden reference.

## Frontend production bundle

Built with the locked dependencies and `npm run build`:

| Asset                 | Raw bytes | Gzip bytes |
| --------------------- | --------: | ---------: |
| `dist/widget.iife.js` | 1,240,427 |    367,665 |
| `dist/widget.css`     |   898,546 |    133,507 |

## Verification commands

```text
frontend: npm test -- --run
frontend: npm run typecheck
frontend: npm run build
frontend: npm run test:e2e
backend:  npm test -- --run
backend:  npm run build
```

Backend TypeScript validation remains governed by `TESTING.md`; the repository
does not currently define a backend typecheck script.

## Known baseline constraints

- A pre-existing root-owned `backend/.next` tree can prevent `next build` from
  replacing generated type files. This is an environment artifact, not a source
  failure; verification should use a writable `.next` tree.
- With a writable isolated build tree, Next.js compiles successfully and then
  fails its existing route type validation in
  `app/api/images/[...path]/route.ts`: `StaticFileRouteContext` permits a direct
  params object, while Next 15 requires the route context params to be a
  `Promise`. Phase 0 does not change this unrelated production route.
- Live unsigned-transaction simulation requires configured RPC endpoints and is
  deferred to the protocol migration phases. Phase 0 locks deterministic local
  instruction and route behavior without network calls.
