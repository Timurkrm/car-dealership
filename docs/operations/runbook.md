# Operations runbook

## Process inventory

Run and supervise independently:

- `@marketplace/api` HTTP + Socket.IO process;
- Next.js web process;
- media worker;
- engagement/outbox worker;
- email delivery worker;
- PostgreSQL/PostGIS, Redis and the selected S3/email/map providers.

All processes use Node.js 24 LTS. Run migrations once before rolling application code;
API startup never migrates.

Local/test infrastructure pins PostgreSQL/PostGIS `17-3.5`, Redis `7.4-alpine` and a
fixed local-only MinIO release. Production must select supported managed versions and
test client/backup compatibility; the application uses the standard S3 API rather than
MinIO-specific behavior.

## Normal startup

Verify secrets/configuration and dependency health, apply reviewed migrations once,
seed managed reference catalogs only when required, then start media, engagement and
delivery workers followed by API/web instances. Wait for readiness before routing API
traffic. A worker startup/config failure exits non-zero for the supervisor.

## Normal shutdown

Remove an API instance from traffic through readiness, send SIGTERM and wait through
`SHUTDOWN_TIMEOUT_MS` plus supervisor margin. Send SIGTERM to each worker and allow its
active bounded job/batch to checkpoint before stopping dependencies. Never stop
PostgreSQL/S3 first during a routine deployment.

## Routine inspection

```sh
npm run ops:status -- --json
npm run ops:verify-data
npm run maintenance:cleanup -- --dry-run
```

Review database writability/connections, the oldest pending outbox/delivery item,
FAILED counts, media state distribution, largest tables and duplicate-index candidates.
An integrity exit code of 2 means a critical invariant failed. Do not mutate data until
the offending rows and recent deployments are understood.

## Health and smoke

Use `/api/v1/health` for liveness and `/api/v1/health/ready` for traffic admission.
Run the anonymous non-destructive smoke against a deployed API:

```sh
SMOKE_API_URL=https://marketplace.example npm run smoke:production
```

It checks liveness, readiness, bounded Cars and Parts searches, both catalogs and
optional Web/security headers. It does not create accounts or data. The separate
authenticated smoke validates account reads and WebSocket connectivity with a
dedicated staging account; pass credentials only through the environment.

## Backup

```sh
mkdir -p backups
npm run db:backup -- --output backups/marketplace-YYYYMMDD.dump --confirm
```

`--confirm` is required only in production and is still recommended in automation.
Encrypt, checksum and upload the resulting file to approved off-host storage, then
remove the local plaintext copy according to policy. Never commit it.

Test the end-to-end mechanism against isolated test infrastructure:

```sh
npm run infra:test:up
npm run ops:restore-test
npm run infra:test:down
```

## Maintenance cleanup

Always inspect first:

```sh
npm run maintenance:cleanup -- --dry-run
npm run maintenance:cleanup -- --confirm
```

The command is bounded and single-run locked. Non-zero exit 3 means another run owns
the lock. Schedule it periodically rather than looping immediately. It never purges
FAILED work, audit, messages, notifications, reports or media database history.

## Backlog recovery

After fixing the underlying cause:

```sh
npm run outbox:recover -- <event-uuid>
npm run delivery:retry -- <delivery-uuid>
npm run media:cleanup
```

Omit the UUID only after reviewing every FAILED row and the resulting blast radius.
Recovery commands are idempotent at their durable boundary but external email remains
at-least-once.

## Dependency incidents

PostgreSQL outage: keep liveness running, remove instances via failed readiness, restore
database service, then run integrity/status before normal traffic.

Redis outage: expect rate-limited routes to return 503, realtime cross-instance fanout
and BullMQ to degrade. Do not bypass the rate limiter. Restore Redis and verify media
dispatch and Socket.IO recovery; PostgreSQL records require no restore.

S3 outage: keep core API/search serving, pause media changes if failure volume is high,
restore provider access, run the storage probe and resume media recovery.

Email outage: business HTTP remains available. Stop/reduce the delivery worker to avoid
a retry storm, verify provider health/credentials, resume and monitor oldest backlog.

Map provider outage: direct users to LIST view; API readiness is unaffected.

## Migration procedure

1. Verify backup and restore-test recency.
2. Review SQL, lock/table rewrite risk, forward/backward application compatibility and
   rollback data loss.
3. Drain/stop incompatible workers if the change requires it.
4. Run one migration process with the migration role.
5. On failure, stop deployment. Preserve the error and locks. Prefer a reviewed forward
   repair; run `migration:revert` only when its down migration is known safe for data
   already written.
6. Verify no pending migrations, integrity and schema diff in CI, then roll workers/API.

Large table indexes need a separately reviewed online/concurrent plan. Extension and
DDL privilege belong to migration credentials; runtime credentials need CRUD only.

## Graceful deployment

Send SIGTERM, wait at least `SHUTDOWN_TIMEOUT_MS` plus supervisor margin and kill only
after the deadline. Readiness changes before draining. Roll API instances one at a
time so browsers reconnect Socket.IO elsewhere. Roll one worker cohort at a time and
watch stale leases/backlog age. A non-zero shutdown means inspect recoverable claims
before retrying the rollout.

## Security operations

Terminate TLS at a trusted proxy, forward WebSocket upgrades, strip client-supplied
forwarding headers and set `TRUST_PROXY_HOPS` to the exact proxy count. Keep CORS at the
single configured web origin. Production cookies require Secure and SameSite Strict.
Swagger is disabled by default in production; enable it only behind an explicit access
policy.

Prometheus metrics are disabled unless `METRICS_ENABLED=true`. Scrape
`/api/internal/metrics` only through the private monitoring network and make public
ingress return 404. See [monitoring.md](monitoring.md).

The API production build disables TypeScript source maps, and Next.js production
browser source maps remain at its disabled default. Do not enable/publicly serve maps
without a protected error-ingestion and artifact-access policy.

Use a restricted S3 runtime principal scoped to the media bucket and required object
verbs/prefixes; do not use root/admin keys. Direct PUT CORS should allow only the web
origin, PUT and the required content-type header. Put PostgreSQL and Redis on private
networks with verified TLS. Rotate secrets through the deployment secret manager.

For the first production administrator, register and verify an account normally,
then execute `ADMIN_BOOTSTRAP_EMAIL=<approved> npm run bootstrap:admin -- --confirm`
from an authorized operator context. The command does not create a password and writes
an audit record. Later role changes use the authenticated Admin API.

## Operational schedule

The following bootstrap cadence requires client RPO/RTO and retention approval:

- continuously retain managed PostgreSQL WAL/PITR and run an encrypted logical backup
  at least daily until a stricter approved RPO replaces this baseline;
- verify backup completion/checksum every run; run an isolated restore drill monthly
  and after database major upgrades, plus a production-equivalent staging PITR drill
  at least quarterly;
- run `ops:verify-data` after deployment/restore and daily; alert on exit 2;
- run `ops:status` at least every five minutes through monitoring and record trends;
- run cleanup dry-run then confirmed bounded cleanup daily after retention approval;
- probe private storage daily and review provider durability/versioning monthly;
- review capacity, deadlocks, autovacuum, index/table growth and provider quotas weekly.

These are technical starting points, not an approved business objective. Record each
job's timestamp/result and alert on missed schedules.

## Table and index maintenance

Review `ops:status` largest relations, PostgreSQL `pg_stat_user_tables`, deadlocks,
autovacuum lag, WAL/disk and unused/index size using the production monitoring system.
Run `ANALYZE` after large imports. Do not schedule indiscriminate `VACUUM FULL` or drop
an index solely because the duplicate-definition report flags a candidate; inspect
constraints and real query plans first.

Safe read-only PostgreSQL inspection examples:

```sql
SELECT pid, state, wait_event_type, wait_event, query_id,
       now() - query_start AS age
FROM pg_stat_activity
WHERE datname = current_database() AND pid <> pg_backend_pid()
ORDER BY query_start;

SELECT blocked.pid AS blocked_pid, blocker.pid AS blocker_pid,
       now() - blocked.query_start AS blocked_for
FROM pg_stat_activity blocked
JOIN pg_locks blocked_lock ON blocked_lock.pid = blocked.pid AND NOT blocked_lock.granted
JOIN pg_locks blocker_lock ON blocker_lock.locktype = blocked_lock.locktype
  AND blocker_lock.database IS NOT DISTINCT FROM blocked_lock.database
  AND blocker_lock.relation IS NOT DISTINCT FROM blocked_lock.relation
  AND blocker_lock.page IS NOT DISTINCT FROM blocked_lock.page
  AND blocker_lock.tuple IS NOT DISTINCT FROM blocked_lock.tuple
  AND blocker_lock.granted
JOIN pg_stat_activity blocker ON blocker.pid = blocker_lock.pid;

SELECT relname, n_live_tup, n_dead_tup,
       pg_total_relation_size(relid) AS total_bytes
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(relid) DESC LIMIT 25;

SELECT schemaname, relname, indexrelname, idx_scan,
       pg_relation_size(indexrelid) AS index_bytes
FROM pg_stat_user_indexes
ORDER BY pg_relation_size(indexrelid) DESC LIMIT 25;
```

`messages`, `notifications`, `notification_deliveries`, `outbox_events`,
`audit_logs`, `listing_media`/variants and `reports` are the main append/growth tables.
Outbox and sent-delivery cleanup bound two of them; the others deliberately await
business/legal retention. Monitor live/dead tuples and index size rather than estimating
growth from a development fixture. PostgreSQL autovacuum is the default maintenance
mechanism; do not run frequent application-driven VACUUM. Performance fixture scripts
run explicit ANALYZE only in their isolated databases.

Vanilla PostgreSQL cannot prove physical index bloat precisely. Treat duplicate index
definitions and size/scan statistics as review candidates; use provider-approved bloat
inspection during maintenance and never auto-drop constraint or low-scan indexes.

## Incident checklist

1. Record start time, deployment version and request/job correlation IDs.
2. Protect authoritative stores and stop unsafe writes.
3. Identify dependency and affected capability using readiness, status and provider
   health, without copying secrets or personal content into incident logs.
4. Stabilize service, then verify integrity and backlog recovery.
5. Run bounded smoke checks.
6. Record user impact, actual RPO/RTO, root cause and follow-up owner.

See [disaster-recovery.md](../disaster-recovery.md) for destructive recovery.
