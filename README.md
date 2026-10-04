# Automotive Marketplace

Production-oriented Cars and Parts marketplace implemented as a TypeScript
modular monolith. The repository contains a Next.js web application, a NestJS
API, PostgreSQL/PostGIS persistence, Redis-backed queues and realtime delivery,
S3-compatible media processing, and three independently deployable workers.

The current release candidate is `0.1.0-rc.1`. Repository artifacts are ready
for client handoff; deployment to real staging and production remains dependent
on client-owned infrastructure and credentials.

## Architecture

```text
Browser -> TLS ingress -> Next.js Web
                     \-> NestJS API replicas -> PostgreSQL/PostGIS
                                            \-> Redis
                                            \-> S3

Media Worker -------> PostgreSQL + Redis + S3
Engagement Worker --> PostgreSQL + Redis
Delivery Worker ----> PostgreSQL + Email provider
Browser Map --------> Public map style/tile provider
```

Web, API and workers use two OCI images: `Dockerfile.web` and
`Dockerfile.backend`. API replicas and workers are separate processes within the
same modular-monolith deployment.

## Requirements

- Node.js 24 LTS (`.nvmrc` pins the verified patch) and npm 11;
- Docker Engine/Desktop with Linux containers and Docker Compose v2;
- local ports 3000, 4000, 5432, 6379, 9000 and 9001 available.

No global npm packages are required.

## Quick start

```sh
npm ci
npm run env:init
npm run infra:up
npm run migration:run
npm run seed:catalog
npm run dev
```

`env:init` creates ignored local environment files with generated development
secrets. The catalog seed is idempotent and **development/test only**. It does
not create demo accounts. Stop local infrastructure with `npm run infra:down`.

## Common commands

| Command                    | Purpose                                      |
| -------------------------- | -------------------------------------------- |
| `npm run lint`             | ESLint, module-boundary and formatting gate  |
| `npm run typecheck`        | Strict TypeScript validation                 |
| `npm test`                 | Backend and frontend unit/HTTP tests         |
| `npm run build`            | Production application builds                |
| `npm run test:integration` | Isolated PostgreSQL/Redis/S3 integration     |
| `npm run test:e2e`         | Full Playwright browser matrix               |
| `npm run test:security`    | Browser/API security regression suite        |
| `npm run container:build`  | Build the release-candidate OCI images       |
| `npm run reference:up`     | Start the production-like reference topology |
| `npm run smoke:production` | Anonymous non-destructive deployment smoke   |

The complete operator command inventory, safety classification and confirmation
requirements are in [Operational commands](docs/operations/commands.md).

## Testing

Integration and E2E tests use the isolated `marketplace-test` environment and
must never target the development or production database. Start it with
`npm run infra:test:up`, apply migrations with `NODE_ENV=test`, run the desired
gate, and stop it with `npm run infra:test:down`.

QA evidence and its limits are indexed by [QA sign-off](docs/qa/qa-signoff.md).
Local measurements are development evidence, not a production SLA.

## Production

Start with the [deployment contract](docs/deployment/README.md), then follow the
[release checklist](docs/release/release-checklist.md). Production configuration
is injected by an orchestrator or secret manager; `.env.production.example` is a
secret-free contract only. The Compose topology is a reproducible staging and
handoff reference, not the recommended enterprise database/Redis/S3 topology.

The Swagger UI is disabled by default in production. Prometheus-compatible
metrics are available at `/api/internal/metrics` when enabled and must remain on
an internal monitoring route.

## Documentation

- [Client handoff index](docs/handoff/README.md)
- [Architecture](docs/architecture.md) and [data model](docs/data-model.md)
- [Frontend design system, shell and result cards (UI-1–UI-3)](docs/frontend/design-system.md)
- [Deployment contract](docs/deployment/README.md)
- [Environment reference](docs/deployment/environment.md)
- [Operations runbook](docs/operations/runbook.md) and [monitoring](docs/operations/monitoring.md)
- [Disaster recovery](docs/disaster-recovery.md)
- [Release `0.1.0-rc.1`](docs/release/0.1.0-rc.1.md)
- [Security policy](SECURITY.md) and [contribution guide](CONTRIBUTING.md)
- [ADR index](docs/adr/README.md)

No open-source license has been selected. Repository use and intellectual
property terms are **PENDING CLIENT LEGAL**.
