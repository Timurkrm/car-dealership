# Disaster recovery

This runbook describes recovery mechanics. Business owners must set the RPO/RTO,
backup schedule and retention before production launch.

Current status: RPO, RTO and legal retention are **PENDING CLIENT APPROVAL**. Until
approved, the deployment must not claim a production recovery guarantee. The initial
technical schedule is continuous managed PITR/WAL, daily encrypted logical backup,
monthly isolated restore and quarterly production-equivalent staging PITR drill; the
client may tighten it after data-volume and business-impact review.

## Preparation

- Keep encrypted, checksummed PostgreSQL custom-format backups off the database host.
- Record PostgreSQL/PostGIS and `pg_dump` versions with each backup.
- Enable provider-native S3 versioning, lifecycle protection and off-site replication
  according to the selected RPO.
- Protect database, storage and Redis credentials in a secret manager and keep a
  tested rotation procedure.
- Run `npm run ops:restore-test` on a schedule and after PostgreSQL major upgrades.
- Preserve immutable infrastructure/deployment versions needed to recreate API and
  workers. Redis is not a business-data backup source.

## PostgreSQL loss or corruption

1. Stop API and all workers, or remove them from traffic, to prevent new writes.
2. Preserve the failed volume/snapshot and provider logs for investigation.
3. Provision a clean compatible PostgreSQL/PostGIS target on private networking.
4. Restore the last verified base backup. Apply WAL/PITR if the deployment supplies it.
5. Run outstanding reviewed migrations only when the restored application version
   expects them.
6. Run `npm run ops:verify-data` and `npm run ops:status -- --json` against the target.
7. Verify `PostGIS_Version()`, migration history, counts for users/listings/subtypes,
   messages, notifications, outbox, deliveries and moderation data.
8. Probe object storage and sample READY media objects/variants. A DB point-in-time and
   S3 version time can differ; keep unreferenced objects until reconciliation proves
   they are safe to remove.
9. Start one worker of each kind, observe stale lease recovery/backlogs, then start API
   instances and run `npm run smoke:production`.
10. Restore normal scale only after readiness, integrity and backlog trends are stable.

If the latest backup fails integrity, stop and restore the previous verified backup.
Do not repair by deleting violating authoritative rows without a reviewed incident plan.

## Redis total loss

1. Keep PostgreSQL and S3 unchanged.
2. Provision Redis with authentication, TLS, private networking and the reviewed
   persistence/eviction policy.
3. Restart or allow reconnecting API/media workers to attach.
4. Observe rate limiter recovery and Socket.IO cross-instance fanout.
5. Run the media cleanup/dispatch process; durable PostgreSQL media rows recreate lost
   BullMQ work. Do not manufacture engagement or email queue rows in Redis.
6. Verify HTTP message history, outbox and delivery backlog. Loss of ephemeral rate
   counters and pub/sub events is expected; business records must remain intact.

## Object storage loss or corruption

1. Disable new media writes while leaving list/search available if safe.
2. Preserve provider audit/version metadata and restore bucket objects from the
   provider backup/versioning system with their exact keys.
3. Run the bucket probe and compare database READY source/variant references to object
   inventory using a purpose-built, rate-limited reconciliation job for the provider.
4. Reprocess only when the immutable source object is present and its database state
   permits it. Missing source and variants are an incident; never publish an exact
   location or substitute unrelated objects.
5. Resume media workers, observe retries/cleanup and sample signed reads.

Database restore alone cannot reconstruct uploaded bytes. Object restore alone cannot
reconstruct ownership, ordering or publication state.

## Email provider outage

No database restore is needed. Keep the delivery worker stopped if the provider is
rejecting traffic, preserve PENDING/RETRY/FAILED rows, rotate a compromised credential
if applicable, then resume. Inspect backlog age and provider idempotency before
requeueing FAILED rows. Ambiguous sends can duplicate when a provider ignores the
stable idempotency key.

## Deployment rollback

Stop the rollout and keep the last healthy instances serving only when the database
schema remains backward compatible. Rolling application binaries back does not roll
data back. Inspect migration down SQL and writes made by the new version; prefer a
forward repair when a down migration would discard or reinterpret data. After any
rollback, run integrity/status and the anonymous smoke before restoring scale.

## Worker backlog recovery

Inspect backlog status and the underlying provider/dependency before changing rows.
Stale PROCESSING leases recover automatically. For permanent FAILED work, requeue a
single reviewed item with `outbox:recover -- <uuid>` or `delivery:retry -- <uuid>`.
Bulk recovery requires an incident decision because it can create provider load and
at-least-once duplicate effects. Media recovery starts with `media:cleanup`, which
rediscovers eligible PostgreSQL rows and rebuilds missing BullMQ dispatch.

## Disk full or read-only database

Readiness fails the writable check for a read-only target. For disk exhaustion, remove
the instance from traffic, preserve evidence, expand storage or restore to a larger
target, then inspect WAL/autovacuum and run integrity verification. Do not delete audit,
message or failed-work history as an emergency cleanup substitute.

## Credential compromise

Rotate provider credentials in this order: create a new credential, deploy consumers,
verify, then revoke the old credential. JWT key rotation supports a current and one
previous key ID; removing the previous key invalidates remaining access tokens signed
by it. Search cursor key material shares the configured application secret and rotation
invalidates short-lived cursors, which clients may safely restart. Database/Redis/S3
credential rotation must be coordinated with connection draining.

## Restore acceptance

A restore is accepted only when the application version starts, PostGIS works, no
critical integrity findings exist, migrations show none pending, smoke checks pass,
sample media reads work and worker backlog/lease recovery is understood. Record actual
recovery duration and data-loss window; use those observations to validate RTO/RPO.
