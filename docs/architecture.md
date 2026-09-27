# Architecture

## System overview

The product will support buying and selling vehicles and automotive parts, with geographic search
and an interactive map of nearby listings. The engineering foundation and
marketplace persistence model, browser authentication and listing workflows are
implemented. Shared multi-category Listing and Parts are implemented; see [parts.md](parts.md) and ADR 0007. Unified PostgreSQL/PostGIS Search and the shared server-clustered MapLibre map are implemented; see [map.md](map.md) and ADR 0008.
See [search-and-geo.md](search-and-geo.md), [data-model.md](data-model.md)
for the canonical schema, [authentication.md](authentication.md) for auth behavior
and [listings.md](listings.md) for seller/public API and UI contracts.

## Architecture

A workspace monorepo contains `apps/web` (Next.js App Router) and `apps/api`
(NestJS). The API is a modular monolith: one deployable backend, explicit domain
ownership and local module calls. Infrastructure connections live under
`platform/`; they do not own business data. Configuration is the only global
module, supplying a validated typed immutable-by-convention startup value.
Platform dependencies are explicitly imported and exported through Nest modules.

Business modules contain their Nest module, public `index.ts`, ownership README
and their implemented domain types/persistence entities. Create application and
presentation folders as functionality is implemented. Avoid empty controllers,
repositories and DTOs.
Controllers handle transport; real rules belong in application/domain code.

## Modules / Data ownership

| Module        | Owns                                                                      | Boundary                                                                         |
| ------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| auth          | Credentials, sessions, authentication lifecycle                           | No credentials in users responses                                                |
| users         | Profiles, account lifecycle, role assignments                             | Auth owns credential material                                                    |
| parts         | Part specifications, category/brand catalog and model/generation fitments | Listings owns stock and common lifecycle; Vehicles owns compatibility references |
| vehicles      | Vehicle specifications and reference data                                 | Listings own publication and price                                               |
| listings      | Shared Listing root, Vehicle/Part links, stock, publication, price        | Money in minor units/fixed decimal with currency                                 |
| media         | Media ownership, metadata, processing                                     | Infrastructure uses standard S3 SDK                                              |
| geo           | Location privacy and geographic calculations                              | PostGIS is authoritative; bounded spatial queries                                |
| search        | Public discovery, cursor/filter model, saved filter persistence           | PostgreSQL authoritative; owner-approved read projections                        |
| favorites     | User-owned saved listings                                                 | Uniqueness and ownership checks                                                  |
| messaging     | Listing-scoped buyer/seller conversations and private messages            | PostgreSQL durability, participant authorization, cursor history and read state  |
| notifications | Durable center and realtime updates                                       | Outbox-deduplicated creation; WebSocket delivery remains best effort             |
| moderation    | Content review and decisions                                              | Moderator permissions distinct from admin                                        |
| admin         | Administrative application operations                                     | Central permissions and audit records                                            |
| audit         | Security and administrative history                                       | Append-only, minimum necessary private data                                      |

Twelve ordered migrations define 32 tables. The Parts migration preserves all root IDs and history through subtype backfill; moderation extends existing reports/actions; engagement adds the durable outbox; messaging adds DB-backed conversation identity, idempotency and exact read watermarks; account delivery adds typed preferences and durable email state; the final compatibility migration records moderator-removed conversations as read-only.
The initial marketplace migration creates 21 tables; the auth migration adds one
purpose-specific action-token table and a verification timestamp. A module owns its entities
and queries; migrations are centrally ordered under platform/database/migrations.
Other modules use explicitly exported APIs or events, not internal repositories/
tables. Public identifiers are UUIDs; timestamps use timestamptz/UTC. Private
credentials are separated from profiles; exact geographic points are excluded
from ordinary selects and optional public points are independently supplied.
Search uses private points internally and kilometre distance buckets publicly; map
markers and clusters use public points exclusively. Stronger anti-inference precision policy remains
a product decision; see search-and-geo.md.

`scripts/check-boundaries.mjs` checks static relative imports/re-exports, rejects
cross-module internal imports and domain module cycles, and rejects web→api
imports. It is part of lint. Do not bypass it with aliases/dynamic imports;
review database access, events and authorization boundaries during feature work.
No path aliases exist now. Platform runtime adapters must not depend on business
services. The intentional composition-root exceptions are entity registration
and the development catalog seed entrypoint; these assemble module-owned
persistence definitions and are not cross-module business access mechanisms.

## Infrastructure

- PostgreSQL + PostGIS is the source of truth. TypeORM DataSource has bounded
  connection/query timeouts, a bounded pool, TLS configuration, UTC connections,
  `synchronize: false`, explicit migrations and disabled automatic extension
  installation. Readiness verifies that PostGIS
  is installed. The initial migration preserves extension on rollback because
  extension ownership may predate the application.
- Redis is authenticated, reconnects with bounded backoff, does not queue API commands
  while disconnected, and has bounded PING/startup. It is degradable rather than an
  API-readiness dependency: rate-limited routes fail closed, BullMQ/realtime pause or
  degrade, and PostgreSQL remains authoritative.
- `ObjectStorage` isolates the standard S3 SDK configuration/lifecycle and bucket
  probe. MinIO is local infrastructure only, with private idempotently created
  buckets. Storage is optional for current health routes. The integration test
  verifies S3 access. AWS/R2 can change endpoint, region, credentials and path style
  without application rules depending on MinIO. Media implements direct uploads and processed delivery.
  Community MinIO is archived and no longer maintained; the pinned legacy Quay
  image is local-only ([upstream](https://github.com/minio/minio)). Production must
  select a supported S3 provider separately.

Docker Compose runs supporting services with loopback ports, healthchecks and
persistent volumes. Apps run on the host for simple development. Test Compose
uses separate project/volumes and non-overlapping ports; test config rejects a
database name without `_test`. Never use integration tests against dev/prod data.
Schema integration tests additionally create/drop an owned template0 database
on the isolated test server, test rollback/reapply and compare ORM metadata to
the migrated schema. The configured test database is never dropped or truncated.

## Request flow / API conventions

```text
Browser → Next.js → REST API /api/v1 → Application module → PostgreSQL / Redis / S3
```

The existing development diagnostic is a Next.js server component calling the
central API client. API_URL is server-only, health requests bypass cache, validate
response shape, support caller cancellation and have a three-second deadline.
Health explicitly omits credentials. Browser authentication uses a dedicated
central client, in-memory access JWT and rotating HttpOnly refresh cookie through
same-origin Next.js rewrites. Requests have a ten-second browser deadline,
single-flight refresh, optional cross-tab Web Locks and safe response parsing.
Homepage has a loading fallback and unavailable state. Error/loading/not-found
pages use semantic HTML and keyboard-accessible controls.

API uses URI versioning (`/api/v1`) and development Swagger (`/api/docs`).
Request ID middleware precedes body parsing, accepts bounded safe IDs or generates
a UUID, and returns `x-request-id`. Validation rejects unknown fields, avoids
implicit type coercion and returns field/rule names without submitted values.
Helmet, controlled CORS, 100 KB bodies and HTTP request/header timeouts establish
basic defaults; they do not replace authorization, rate limiting or feature-specific
security review. Auth POST routes additionally enforce exact Origin and atomic
Redis policies; protected routes use current PostgreSQL account/session/roles.

Auth owns application lifecycle services, credential/token persistence and the
EmailSender adapter. Users exports an explicit identity API with transaction-aware
account reads/locks/role lookup; auth does not access Users' private tables.
AuditWriter joins caller transactions. There are no circular domain imports.
Moderation orchestrates Listing publication contracts, bounded Messaging context,
Users summaries, persisted Notifications and Audit in caller-owned transactions.
Admin composes Users account/role records, Auth session revocation, Listing counts
and the safe Audit projection. See [moderation-and-admin.md](moderation-and-admin.md)
and ADR 0009.
Listings owns principal-scoped offers and their versioned lifecycle. It calls
Parts/Vehicles/Geo/Users through explicit module APIs; those modules own all table
access. Aggregate reads use bounded batches and REPEATABLE READ snapshots.
Seller mutations use owned-row locks and atomic version/status CAS with audit
in the same transaction. Vehicle specification edits create a new observation
and relink only that offer; ADR 0004 explains historical isolation. Public DTOs
never include VIN, exact point, contact data, storage keys or internal version.
Local/test email preview is bounded ephemeral memory without public routes or
token logs; production uses a replaceable HTTPS gateway adapter. Durable delivery
intent is committed in PostgreSQL, and a separate worker performs bounded provider
I/O with leases, retries and safe failure logs. Session cleanup is
bounded and ready for a future scheduler. See ADR 0003 for auth trade-offs.

Ordinary errors have `{statusCode, code, message, details, requestId}`. Unexpected
errors contain a generic message, never SQL, stack traces or infrastructure paths.
Readiness is a privacy-safe probe response containing only `status`. It is 503 while
the process drains or writable PostgreSQL/PostGIS is unavailable. Redis degradation is
logged internally without exposing topology or removing unrelated routes from service.
Liveness probes only the process. See [reliability.md](reliability.md).

Logs are JSON lines with UTC timestamp, level, service, environment and message;
request logs include ID, method, status and duration. Do not log request bodies,
URLs with queries, auth headers, cookies or raw exceptions. Infrastructure logs
use operation names and safe summaries. Future jobs must carry correlation/job IDs.
Listing operation logs include the offer UUID after commit; transactional audit
captures machine events without user values. Log shipping, metrics exporters and
distributed tracing remain separate deployment work.

## Future scalability

Search, geo, media, messaging, notifications and analytics may eventually be
extracted if load, deployment independence or team ownership justify the cost.
Use explicit APIs/events and consider idempotency/outbox for durable side effects
when requirements arise. Media now uses BullMQ/Redis and its persisted state as a
durable bounded dispatch/cleanup outbox; see media.md and ADR 0005. There is no
OpenSearch or microservice infrastructure. Database indexes follow real access patterns.

## Deployment direction

Build web and API independently from the same lockfile. The backend is stateless;
persistent state lives in PostgreSQL/object storage. Externalize credentials and
configure managed PostgreSQL/PostGIS, Redis and S3 endpoints. Run migrations once
as a deployment task before routing traffic; do not let replicas race migrations.
Use readiness for traffic gating and liveness for process supervision. SIGINT and
SIGTERM close HTTP, database, Redis and SDK resources. Keep proxy routing/TLS and
drain periods explicit in the future deployment configuration.

Deploy the media worker (`npm run worker:media`) as a separate process of the monolith.
Composition wires ListingMediaPort to MediaReadService and injects the configured
Listings module into Media without a circular module dependency. Media calls the
public ListingAccess facade; listing internals do not read media tables. Background
work has identifiers only, persisted leases/fencing, bounded retries and source cleanup.
Worker destruction drains jobs before database/Redis/storage application-shutdown hooks.

Deploy the engagement worker (`npm run worker:engagement`) independently from the
HTTP process. Listing lifecycle events are committed to the PostgreSQL outbox with
business state and consumed at least once with leases, checkpoints, and DB-backed
notification deduplication. It does not depend on Redis. See
[favorites-saved-searches-notifications.md](favorites-saved-searches-notifications.md)
and [ADR 0010](adr/0010-transactional-outbox-for-domain-events.md).

Deploy the email delivery worker (`npm run worker:delivery`) independently from
HTTP and engagement processing. Notification creation schedules one deduplicated
EMAIL row transactionally. Security action rows use the same delivery table but
bypass mutable product preferences. See
[account-and-email-delivery.md](account-and-email-delivery.md) and
[ADR 0012](adr/0012-asynchronous-email-delivery.md).

Deployment images/orchestrator remain separate tasks; persistence decisions are captured in
[ADR 0002](adr/0002-marketplace-data-model.md). This repository does not claim a
completed production rollout. Browser auth decisions are captured in
[ADR 0003](adr/0003-browser-authentication-strategy.md).
