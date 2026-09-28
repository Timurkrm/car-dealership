# Contributing

## Setup

Use Node.js 24 LTS, npm 11 and Docker Compose. From a clean clone:

```sh
npm ci
npm run env:init
npm run infra:up
npm run migration:run
npm run seed:catalog
npm run dev
```

Do not commit `.env` files, generated reports, credentials, database dumps or
runtime artifacts.

## Engineering rules

- Preserve the modular-monolith boundaries described in `AGENTS.md` and
  [Architecture](docs/architecture.md); import another module through its
  `index.ts` contract.
- Keep TypeScript strict, validate every external input, use parameterized SQL,
  and enforce authorization on the backend.
- PostgreSQL is authoritative. Use migrations for schema changes and PostGIS for
  set-based geographic work.
- Store money in integer minor units and timestamps in UTC.
- Add tests for meaningful behavior and update OpenAPI/docs with public-contract
  changes.
- Never place secrets or private customer data in tests, logs or fixtures.

## Database changes

Create a new migration; do not edit a migration that may already have run. Review
generated SQL, constraints, index cost and rollback behavior. Run clean apply,
integration migration verification and zero schema-diff checks. For large tables,
use expand/deploy/backfill/contract across releases.

## Pull requests

Keep changes focused. Describe the concrete behavior, migration/rollback impact,
security and privacy considerations, and commands actually run. Required local
gates are:

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

Run integration, E2E, security, query-plan and operational workflows when the
change touches those areas. Never claim an unexecuted check passed.

Security findings follow [SECURITY.md](SECURITY.md), not a public pull request.
