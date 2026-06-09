# Testing

Run the unit-test suites from each package:

Frontend:
  cd frontend
  npm run test:coverage
  npm run typecheck

Backend:
  cd backend
  npm run test:coverage

Backend TypeScript validation is currently tracked separately because existing production files still fail `npx tsc --noEmit`.

Frontend E2E smoke tests:
  cd frontend
  npm run test:e2e
