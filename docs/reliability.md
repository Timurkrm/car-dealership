# Reliability and production operations

## Dependency model

PostgreSQL/PostGIS is the only authoritative store for marketplace, identity,
messaging, queue intent and delivery state. Redis and S3 contain recoverable or
derived state. External delivery and map providers never decide whether committed
business data exists.

| Dependency              | Role                                              | Required for API readiness | Failure behaviour                                                                     | Recovery                                                                      |
| ----------------------- | ------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| PostgreSQL/PostGIS      | authoritative, request-critical                   | yes                        | readiness is 503; data-backed requests fail safely                                    | the pool reconnects; readiness returns 200 after a writable PostGIS check     |
| Redis rate limiter      | ephemeral security control                        | no                         | protected/rate-limited routes fail closed with `RATE_LIMIT_UNAVAILABLE`               | node-redis reconnects with bounded exponential delay                          |
| Redis/BullMQ            | asynchronous media dispatch                       | no                         | committed media rows remain in PostgreSQL; enqueue fails or is deferred               | the media dispatcher scans durable eligible rows and re-enqueues idempotently |
| Redis realtime          | degradable fanout                                 | no                         | messages remain durable; cross-instance fanout can be delayed/unavailable             | clients reconnect and the adapter reconnects; HTTP history is authoritative   |
| S3-compatible storage   | authoritative media bytes, external to PostgreSQL | no                         | uploads/processing fail in a controlled way; signed public DTO generation stays local | retry processing/cleanup after the provider recovers                          |
| Email gateway           | asynchronous external side effect                 | no                         | PENDING/RETRY delivery backlog grows; HTTP business actions continue                  | lease recovery and bounded exponential retry with jitter                      |
| Map style/tile provider | frontend, degradable, external                    | no                         | the map shows an error; list search and API remain available                          | MapLibre retries on a later view/reload                                       |

## Availability model

The API is available for core traffic only while the database is writable. Redis
loss deliberately produces partial degradation: endpoints protected by the shared
rate store return 503, queues stop dispatching and multi-instance realtime fanout
degrades. This avoids weakening abuse controls or pretending ephemeral state is
authoritative. S3, email and map provider health do not remove the whole API from
service discovery because most routes do not require them.

No circuit breaker was added. Calls already have short timeouts, bounded retries and
durable retry state; an in-process breaker would add per-instance state without
improving correctness at the current traffic model.

## Liveness/readiness

`GET /api/v1/health` is process-only liveness. It performs no dependency I/O and
returns `{ "status": "ok" }`.

`GET /api/v1/health/ready` returns 200 only when the process is accepting traffic
and PostgreSQL is reachable, writable and has PostGIS. It returns 503 while graceful
shutdown is in progress or PostgreSQL is unsuitable. Redis is probed for internal
diagnostics and produces a structured degradation warning, but does not change the
public response. The anonymous response contains only `status`; host names, database
names and provider topology are not exposed.

Workers are separate supervised processes. Their operational health is process
state plus PostgreSQL backlog/lease age from `npm run ops:status`. A durable worker
heartbeat registry is intentionally absent: it would duplicate orchestrator health
and backlog monitoring without proving that work is progressing.

## PostgreSQL

The driver is explicitly configured with a pool maximum of 10 connections per
process, 3 second connection acquisition timeout, 30 second idle timeout, 15 second
query/statement timeout, 2 second lock timeout and 10 second idle-in-transaction
timeout. All are validated and configurable. Capacity planning must preserve:

```text
(API instances + DB-backed worker processes) * pool maximum + operator headroom
  < PostgreSQL max_connections
```

Connection acquisition and statements fail within a bound. The resilience test
holds every connection in a two-connection test pool, verifies the next acquisition
times out, releases one and verifies recovery. No global transaction retry exists.
Deadlocks, lock timeout and serialization errors surface as controlled failed
operations; retry is limited to explicitly idempotent commands and durable workers.

Transactions cover database state transitions only. S3 reads/writes, email HTTP and
realtime publication happen outside business transactions. Worker claims are short
`SKIP LOCKED` transactions. Message send locks one conversation so moderator removal
and sending have a deterministic order.

## Redis

API startup waits at most three seconds for Redis, then starts degraded while the
client reconnects with capped exponential delay. Redis loss has distinct policies:

- authentication and all request rate policies fail closed;
- media dispatch is best-effort after the durable PostgreSQL state is committed;
- BullMQ pauses/reconnects and duplicate jobs remain idempotent;
- engagement and delivery workers do not use Redis for their authoritative queues;
- Socket.IO can serve local-instance sockets while cross-instance fanout is absent;
- session validation and revocation remain PostgreSQL-authoritative.

Local Compose enables Redis AOF. Production must use private networking,
authentication, TLS, an intentional eviction policy and persistence appropriate for
ephemeral workload recovery. Correctness does not rely on restoring Redis.

## Object storage

The bucket is private. The browser receives short-lived scoped PUT/GET signatures;
storage keys and credentials never enter public DTOs. SDK network operations have
3 second connection and 10–15 second operation bounds with two SDK attempts.
Upload completion verifies the object before committing the durable transition.
Processing retries transient storage failures. Publication still requires a READY
primary image with all variants.

Public URL signing is local cryptography, so a storage outage does not make Search or
listing JSON fail. Image requests can fail at the provider and recover on a fresh URL.
`npm run ops:storage-probe` performs the explicit bucket
probe used by operations and resilience tests.

## Email provider

HTTP actions commit email intent to PostgreSQL and never wait for the provider.
Provider calls have a validated timeout. Timeout, 429 and 5xx responses become
RETRY with bounded exponential delay, Retry-After support and jitter. Permanent
rejection becomes FAILED and remains for operator review. A stable delivery UUID is
the idempotency key, but ambiguous provider acceptance remains at-least-once unless
the provider honours it.

## Map provider

Map style and tiles are a browser-only degradable dependency. Their failure is not
part of API readiness. The LIST view remains usable. Production must allow only the
chosen provider origins in CSP and monitor provider quota/status separately.

## HTTP timeouts

The Node server uses a 30 second request timeout, 15 second headers timeout and
5 second keep-alive timeout. The reverse proxy should use a headers timeout below
the application header timeout, an upstream response timeout slightly above 30
seconds, and an idle keep-alive timeout aligned with or below the Node value. WebSocket
upgrade and long-lived idle policy must be configured separately.

JSON and form bodies are capped at 100 KiB. Media bytes are direct-to-S3 and never
pass through the normal JSON body parser. S3 and email calls have explicit abort
timeouts. Client-visible errors do not include raw provider or SQL errors.

## Database pool

`DATABASE_POOL_MAX`, `DATABASE_CONNECTION_TIMEOUT_MS`,
`DATABASE_IDLE_TIMEOUT_MS`, `DATABASE_STATEMENT_TIMEOUT_MS`,
`DATABASE_LOCK_TIMEOUT_MS` and `DATABASE_IDLE_TRANSACTION_TIMEOUT_MS` are centralized
configuration. Pool size is a deployment calculation, not a per-instance performance
knob. `npm run ops:status` reports current database connection count; PostgreSQL
capacity and pool-wait telemetry must be added by the selected monitoring platform.

## Graceful shutdown

SIGTERM and SIGINT enter `shutting_down` before closing resources. API readiness then
fails; Node stops accepting connections and allows active requests to drain; Nest
closes Socket.IO, Redis and the database pool. API and workers share a 20 second
bounded shutdown deadline. On expiry they log a safe failure and exit non-zero so a
supervisor can replace them.

Media stops its dispatcher, waits for the active bounded dispatch/job and closes
BullMQ. Engagement and delivery stop polling and await the current bounded batch.
If a process is killed after the deadline, BullMQ stalled-job recovery or PostgreSQL
lease expiry makes the work claimable again. External email delivery remains
at-least-once across an ambiguous process death.

## Worker recovery

- Media: durable status/dispatch timestamps reconstruct lost Redis jobs; processing
  tokens prevent stale workers from committing over a newer attempt.
- Engagement: stale PROCESSING outbox leases return to work; notification uniqueness
  makes repeated fanout idempotent.
- Delivery: stale PROCESSING delivery leases return to RETRY; stable IDs deduplicate
  at gateways that implement the contract.
- Poison records consume a bounded attempt budget and become FAILED. Operators inspect
  before using `outbox:recover` or `delivery:retry`.

All lease comparisons use PostgreSQL `CURRENT_TIMESTAMP`; application clock skew does
not decide lease expiry. Hosts must still run NTP for JWT, logs and provider timestamps.

## Retry/backoff

Media uses BullMQ exponential backoff with 25% jitter. Outbox and email delivery use
bounded exponential delays with random jitter; email also honours a bounded
Retry-After. HTTP request handlers do not blindly retry non-idempotent operations.

## Backup

`npm run db:backup -- --output backups/<name>.dump` creates a PostgreSQL custom-format
logical backup using `pg_dump --no-owner --no-privileges`. It refuses overwrite,
requires an existing destination directory and removes a partial file on failure.
Production requires `--confirm`. `PG_DUMP_BIN` can select a pinned compatible client.

Backups are excluded from Git. Production automation must encrypt the artifact,
transfer it to access-controlled off-host/object-locked storage, record checksum and
tool/server versions, enforce retention and test restores. The repository cannot set
RPO/RTO without business and deployment requirements.

Logical export is the portable fallback. Production should additionally use the
managed PostgreSQL service's encrypted physical snapshots and point-in-time recovery
when the approved RPO is materially below the logical-backup interval. Application
scripts do not replace provider-native WAL/PITR operations.

## Restore

`npm run ops:restore-test` creates isolated source and target databases whose names
carry destructive-operation guards. It migrates and seeds the source, takes a real
custom `pg_dump`, restores into a fresh database, runs read-only integrity checks,
verifies domain row counts and calls `PostGIS_Version()`, then removes both databases
and the temporary dump in `finally`.

Use a `pg_restore` client from the target PostgreSQL major version or newer and test
every server-major upgrade. A database restore does not restore S3 objects; use the
disaster recovery procedure to reconcile them.

## Retention

| Data                                            | Current retention                              | Cleanup authority                              |
| ----------------------------------------------- | ---------------------------------------------- | ---------------------------------------------- |
| expired auth action tokens                      | expiry + 30 days                               | automated, configurable                        |
| expired sessions and token rotation history     | expiry + 30 days; child token history cascades | automated, configurable                        |
| PROCESSED outbox without Notification reference | 60 days after processed time                   | automated, configurable                        |
| SENT/SUPPRESSED external deliveries             | 60 days after last update                      | automated, configurable                        |
| FAILED outbox/delivery                          | indefinite pending operator review             | manual recovery/investigation                  |
| audit logs                                      | indefinite                                     | business/legal policy required before deletion |
| conversations/messages                          | indefinite                                     | product/legal policy required before deletion  |
| in-app notifications                            | indefinite                                     | product policy required before deletion        |
| media tombstones and media database rows        | indefinite; object cleanup is state-driven     | product policy required before row purge       |
| reports/moderation actions                      | indefinite                                     | legal/moderation policy required               |
| users/listings/favorites/saved searches         | business lifetime                              | domain operation/policy only                   |

Defaults are operational safety values, not a legal retention determination.

## Cleanup

`npm run maintenance:cleanup -- --dry-run` reports eligible rows. Mutation requires
`--confirm` in production. One PostgreSQL session advisory lock prevents concurrent
runs. Each category deletes ordered `FOR UPDATE SKIP LOCKED` batches, commits between
batches and stops at `CLEANUP_MAX_ROWS_PER_RUN`. Repeated execution is idempotent.
FAILED work and business/audit/message data are never deleted. A failed category is
reported without preventing later independent categories from running, and the command
exits non-zero for operator investigation.

Media has its existing independent state-driven cleanup dispatcher. It revisits
tombstones and expired/incomplete uploads and safely tolerates late writes. A full
provider-wide orphan reconciliation is deferred because listing every production
bucket object needs provider cost/rate policy; database and prefix-scoped media cleanup
remain the source of safe deletion decisions.

## Operational inspection

`npm run ops:status -- --json` reports PostgreSQL/PostGIS version, writability,
connection count, outbox/delivery depth and oldest pending age, media states, ten
largest relations and exact-definition duplicate-index candidates. It emits no host,
database name, credential, email, message body or location.

Use provider dashboards for bucket capacity/quota and email health. Use PostgreSQL
views/monitoring for disk, replication, WAL, autovacuum, deadlocks and pool waits.
The repository does not expose a public operations or metrics endpoint.

## Integrity verification

`npm run ops:verify-data` is read-only and exits 2 on critical findings. It checks
Listing subtype exclusivity, PUBLISHED/READY-primary invariants, positive published
part stock, location/media orphans, exactly two correct conversation participants,
delivery/notification references and impossible queue lease states. Stale leases are
reported as noncritical because workers recover them.

## Deployment/migrations

Application startup never runs migrations and `synchronize` is false. Deploy with a
separate migration role, one migration runner and a pre-deployment backup. Review lock
and table-rewrite risk; future large-table indexes should use a reviewed online or
`CONCURRENTLY` plan where transaction semantics permit it. Runtime roles need only
CRUD on application tables/sequences, never schema/extension/role privileges.

The first deployment creates PostGIS and therefore needs a privileged migration role;
runtime does not. Rollbacks are selected per migration and are never an automatic
response after new code has written a changed format. Prefer forward fixes. Rolling
deployments require old and new versions to tolerate the schema during the overlap.

The hardening migration adds one nullable timestamp without a default, so PostgreSQL
does not rewrite conversation rows. `ALTER TABLE` still takes an ACCESS EXCLUSIVE lock;
run it as the dedicated migration step with the configured 2 second lock timeout and
retry only after identifying blockers. Existing historical migrations contain ordinary
blocking DDL/index creation and are intended for empty bootstrap; large populated-table
changes require a reviewed online/`CREATE INDEX CONCURRENTLY` pattern.

Reference catalog seeding is idempotent and contains no demo users. Demo/admin helper
commands refuse production. Run migration, then reference catalog seed if the target
database has no catalog data, then start workers and API.

## Known limitations

There is no selected monitoring vendor, metrics backend, distributed tracing, browser
E2E suite, penetration test, load/soak result or real provider smoke. Backups are
logical database backups only; encryption, schedule, off-site replication and RPO/RTO
are deployment responsibilities. S3 and PostgreSQL do not have a cross-system atomic
snapshot. CSP currently permits inline Next.js scripts/styles and HTTPS images; a
nonce-based deployment CSP needs end-to-end proxy/rendering work. Container production
images and resource limits are not defined in this repository; Compose is local/test
infrastructure.

## Failure test matrix

| Failure                    | Expected API behaviour                                                  | Expected worker behaviour                                      | Recovery evidence                                           |
| -------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------- |
| PostgreSQL stopped         | liveness 200, readiness 503, data routes fail                           | DB-backed workers stop claiming                                | controlled restart returns readiness 200                    |
| Redis stopped              | readiness remains 200; rate-limited routes fail closed                  | media queue pauses; engagement/delivery keep PostgreSQL intent | reconnect after Redis start; no authoritative rows lost     |
| MinIO stopped              | core readiness/search remains available; object operations fail bounded | media attempt retries/fails safely                             | bucket probe succeeds after restart                         |
| email 429/5xx/timeout      | business request stays committed                                        | delivery becomes RETRY with backoff/jitter                     | deterministic provider tests and lease recovery             |
| process death with lease   | committed data remains                                                  | stale claim becomes eligible                                   | integration tests cover outbox, delivery and media recovery |
| realtime Redis unavailable | HTTP message persistence/history remains authoritative                  | cross-instance fanout degrades                                 | adapter reconnects; client refetch/reconnect restores view  |
