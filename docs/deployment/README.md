# Production deployment contract

This document is vendor-neutral. It defines the runtime contract an orchestrator
must satisfy and the sequence for staging and production. The repository does not
claim that client cloud resources, DNS, certificates or provider accounts exist.

## Process topology

| Process           | Image   | Command                                                                                            | Port / health                                  | Dependencies                                      |
| ----------------- | ------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------- |
| Web               | web     | `node apps/web/server.js`                                                                          | 3000, `/`                                      | API server origin, public map provider            |
| API               | backend | `node apps/api/dist/main.js`                                                                       | 4000, `/api/v1/health`, `/api/v1/health/ready` | PostgreSQL, Redis, S3                             |
| Media worker      | backend | `node apps/api/dist/main-media-worker.js`                                                          | process supervision                            | PostgreSQL, Redis, S3, bounded `/tmp/marketplace` |
| Engagement worker | backend | `node apps/api/dist/main-engagement-worker.js`                                                     | process supervision                            | PostgreSQL, Redis                                 |
| Delivery worker   | backend | `node apps/api/dist/main-delivery-worker.js`                                                       | process supervision                            | PostgreSQL, email gateway                         |
| Migration job     | backend | `node node_modules/typeorm/cli.js migration:run -d apps/api/dist/platform/database/data-source.js` | one-shot exit status                           | PostgreSQL migration role                         |

Run at least two API replicas for rolling availability. Scale Web, API and each
worker independently. Separate processes remain one modular-monolith release and
must use the same immutable backend image digest.

All containers run as the image's non-root `node` user, accept `SIGTERM`, and
need a writable bounded temporary mount only where declared. Use a read-only root
filesystem, drop Linux capabilities, prohibit privilege escalation and enforce
CPU/memory/ephemeral-storage limits in the target platform. The media worker's
initial concurrency is 2 and its temporary volume must hold concurrent decoded
source/variant work; size from the staging benchmark before launch.

## Images and release identity

`Dockerfile.backend` and `Dockerfile.web` are multi-stage builds pinned to Node
24.21.0 Debian Bookworm slim. Final images contain compiled runtime artifacts and
production dependencies. The backend image also contains compiled TypeORM
migrations and all worker entrypoints. `npm run container:inspect` verifies the
non-root user and absence of source, tests, fixtures and environment files.

Build once after green CI, scan, publish version and Git-SHA tags, record the
registry digest, and promote that exact digest:

```text
registry.example/automotive-marketplace-backend:0.1.0-rc.1
registry.example/automotive-marketplace-backend:sha-<commit>
registry.example/automotive-marketplace-web:0.1.0-rc.1
registry.example/automotive-marketplace-web:sha-<commit>
```

Do not use `latest` as deployment identity. Registry publication and signing are
**PENDING EXTERNAL**. The release workflow supports immutable GitHub Container
Registry publication after client environments and permissions are configured.

## External services

### PostgreSQL/PostGIS

Use PostgreSQL 17 with a PostGIS 3.5-compatible extension, UTC, encrypted private
networking, automated backups/PITR, HA appropriate to the approved RTO, storage
monitoring and tested restore. `postgis` must be installed by a privileged
bootstrap role before the migration job if the managed platform does not permit
the migration role to create extensions.

Use separate login roles:

- `marketplace_migration`: schema owner/DDL for the one-shot migration job;
- `marketplace_runtime`: `CONNECT`, schema `USAGE`, and required table/sequence
  DML only; no role/database/extension creation;
- monitoring/backup roles owned by SRE with provider-specific minimal grants.

If the migration role owns objects, configure default privileges for the runtime
role. Review the generated grants against every new table. Never run the API with
the migration owner. Example baseline (adapt identifiers and managed-provider
rules before use):

```sql
GRANT CONNECT ON DATABASE marketplace TO marketplace_runtime;
GRANT USAGE ON SCHEMA public TO marketplace_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO marketplace_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO marketplace_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE marketplace_migration IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO marketplace_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE marketplace_migration IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO marketplace_runtime;
```

Set process-specific `DATABASE_POOL_MAX`. Budget the provider limit as:

```text
(API replicas × API pool)
+ (media replicas × media pool)
+ (engagement replicas × engagement pool)
+ (delivery replicas × delivery pool)
+ migration/operations allowance
+ provider/admin reserve
```

The reference topology's five backend processes at pool 10 can open 50
connections, plus transient migration/operations connections; this is an example,
not a production recommendation. Alert before the provider limit is exhausted.

### Redis

Use a private TLS endpoint with authentication, HA/failover, `noeviction`, memory
and connection alerts, and provider-supported persistence. Redis carries rate
limits, Socket.IO fanout and BullMQ coordination; PostgreSQL remains authoritative.
An outage degrades realtime/rate limiting/media dispatch, while durable database
rows enable recovery. Preserve a stable endpoint through failover and validate
reconnect behavior in staging.

### S3-compatible storage

Use a private bucket with public access blocked, server-side encryption,
versioning/replication/lifecycle according to the approved durability/retention
policy, and provider access logs where required. Runtime IAM needs only bucket
location/list for the configured bucket and object get/put/delete under the
application-owned prefix. It must not manage buckets, policies or unrelated keys.

Direct browser uploads use short-lived signed PUT URLs. Configure CORS for the
single production web origin:

```json
[
  {
    "AllowedOrigins": ["https://marketplace.example"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["content-type"],
    "ExposeHeaders": ["etag"],
    "MaxAgeSeconds": 600
  }
]
```

Source images remain private. Public DTOs receive short-lived signed variant
URLs; storage keys are never public API fields. The provider-specific IAM policy,
durability class and restore procedure are **PENDING EXTERNAL**.

### Email and map providers

Production email uses the HTTPS delivery adapter, a secret-manager key and a
verified From identity. Configure SPF, DKIM and DMARC, provider idempotency,
quota, bounce/complaint processing and credential rotation. Staging must use a
sandbox/capture account or recipient allowlist. Real-provider smoke is
**PENDING EXTERNAL**.

The map style URL and attribution are public build-time Web values. Restrict any
public token by allowed origins and quota, configure all style/tile/font origins
in CSP, and keep the Cars/Parts LIST mode usable during provider failure. Provider
selection and staging smoke are **PENDING EXTERNAL**.

## Edge, TLS and WebSocket

Terminate TLS 1.2+ at the client edge, redirect HTTP to HTTPS, preserve the host,
strip untrusted incoming forwarding headers, and add the trusted values exactly
once. Set `TRUST_PROXY_HOPS` to the measured number of trusted proxy hops. Never
guess this value.

Route `/api/*`, `/socket.io/*` and the `/realtime` namespace to the API pool. The
Socket.IO transport is WebSocket-only, so no sticky session is required; Redis
adapter fanout is required across replicas. Preserve Upgrade/Connection headers,
idle timeouts longer than expected sessions, and graceful connection drain.
Route everything else to Web. Keep `/api/internal/metrics` off public ingress.

The reference Caddy stack validates TLS routing, WebSocket upgrade, API
round-robin, health admission and metric isolation with an internal development
CA. Production must use a publicly/client-trusted certificate and must never
disable certificate verification.

## Deployment sequence

1. **Phase 0 — infrastructure:** provision DNS/TLS, registry, PostgreSQL/PostGIS,
   Redis, S3, email, map, secret manager, monitoring, backups and on-call.
2. **Phase 1 — staging:** use production images/config shape and synthetic or
   approved anonymized data; never copy raw customer data.
3. **Phase 2 — RC validation:** restore/backup gate, migration dry review,
   provider smoke, proxy Playwright, security, topology and baseline load.
4. **Phase 3 — production:** promote scanned digests; run exactly one migration
   job; deploy compatible workers, API and Web gradually; pass readiness/smoke.
5. **Phase 4 — observation:** watch the release for 30–60 minutes or the
   organization-approved window using the release checklist.
6. **Phase 5 — handoff:** record digests, migration state, smoke evidence,
   incidents/waivers and ownership acceptance.

For event-contract changes, deploy backward-compatible consumers before
producers. This release uses the same backend artifact for both sides and its
current database changes are additive/compatible with rolling deployment. Future
large-table changes must use expand, compatible deploy, bounded backfill and a
later contract migration.

## Migrations and first run

API/worker startup never auto-migrates and TypeORM `synchronize` is disabled.
Before deployment, inspect pending migrations and SQL, confirm PITR/backup health,
then run one migration job with the migration role. If it fails, stop rollout and
keep the previous application deployment serving; investigate before retrying.

Do not seed demo users/listings. The repository catalog seed contains limited
development fixtures and refuses production. Import client-approved vehicle and
part reference catalogs through a reviewed idempotent data operation; catalog
content approval is **PENDING CLIENT PRODUCT**.

Create the first account through the normal registration/verification flow, then
run the controlled bootstrap from a backend image with runtime DB access:

```sh
ADMIN_BOOTSTRAP_EMAIL=approved-admin@example npm run bootstrap:admin -- --confirm
```

The command never creates credentials, requires an existing active verified
account, is idempotent and writes `USER_ROLES_CHANGED` to the audit log. Limit
execution to an authorized operator session and remove the one-time environment
value afterward.

## Rolling deployment and rollback

Require at least one ready API replica while another drains for the configured
grace period. Wait for edge health admission before draining the next replica.
Workers finish/lease work during bounded shutdown; durable rows make retry safe.

Rollback application images by digest only when the prior code is compatible
with the current schema. Never blindly revert a production migration. Prefer
forward repair; a reviewed migration down is permitted only after data-loss and
compatibility analysis. Roll back immediately for persistent auth/authorization
failure, data corruption, unacceptable 5xx/readiness, migration incompatibility,
or queue growth that threatens the approved recovery objective. See the
[release checklist](../release/release-checklist.md) for operator decision points.

## Reference deployment

`compose.production.example.yml` provides two APIs, Web, three workers, a
migration job, Caddy, PostgreSQL/PostGIS, Redis and MinIO for reproducible local
staging/handoff validation. Local managed-service substitutes are deliberately
included and are not an enterprise-production recommendation.

```sh
npm run container:build
docker compose -f compose.production.example.yml --env-file .env.production.local run --rm migration
npm run reference:up
npm run smoke:production
npm run smoke:authenticated
npm run test:topology
npm run test:e2e:proxy
npm run benchmark:media
npm run reference:down
```

Use synthetic credentials in the ignored local environment. The reference map
style is an empty same-origin test style; it is not a production basemap.
