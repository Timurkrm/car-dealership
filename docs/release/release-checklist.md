# Release checklist

Record evidence, operator, timestamp, Git SHA and image digests in the release
ticket. A checkbox without linked evidence is not a completed gate.

## Pre-release

- [ ] SemVer release candidate and Git tag approved; working tree/release commit identified.
- [ ] CI lint, typecheck, unit, integration and build gates are green.
- [ ] QA sign-off, Chromium critical/security and scheduled browser matrix are green.
- [ ] Dependency, secret and final-image scans have no unresolved Critical/High release blockers.
- [ ] Web/backend images were built once, SBOM generated, digests recorded and signatures/provenance applied if client policy requires.
- [ ] Migration SQL and rolling compatibility reviewed; exactly one migration runner assigned.
- [ ] PostgreSQL backup/PITR healthy and restore evidence within policy.
- [ ] Production secrets, DNS/TLS, DB/PostGIS, Redis, S3, email, map and monitoring are ready.
- [ ] RPO/RTO, retention/privacy/email and license/IP decisions approved.
- [ ] On-call, incident commander, provider escalation and rollback authority assigned.
- [ ] Staging used the promoted digests and passed providers, proxy E2E, topology, smoke and baseline load.

## Deployment

- [ ] Confirm current release, schema migration table and provider health.
- [ ] Run the migration job once; stop immediately on non-zero exit.
- [ ] Deploy backward-compatible consumers/workers, then API replicas and Web as applicable.
- [ ] Drain one API at a time; wait for readiness and edge health admission before continuing.
- [ ] Confirm liveness/readiness, internal metrics and structured logs for each process.
- [ ] Run anonymous and approved authenticated smoke: login, Cars, Parts, Map, media path, messaging WebSocket and logout.
- [ ] Verify email/map provider smoke without sending unintended customer messages.
- [ ] Confirm public Swagger/metrics policy and security headers at the edge.

## Observation window

For 30–60 minutes, or the approved change window, observe:

- [ ] HTTP 5xx, latency and ready replica count;
- [ ] PostgreSQL pool waiters, connections, locks, replication/storage and slow queries;
- [ ] Redis health, memory, eviction and reconnects;
- [ ] outbox, email delivery and media backlog/age/failures;
- [ ] WebSocket connections/reconnects and cross-replica delivery;
- [ ] Search/Map errors, provider quota and frontend error telemetry;
- [ ] S3 errors/quota and signed upload/read behavior.

## Rollback decision

Rollback/stop rollout for migration failure, suspected data corruption, auth or
authorization regression, persistent readiness/5xx breach, unsafe secret/TLS
behavior, unrecoverable provider incompatibility, or backlog growth that exceeds
the approved recovery objective. The release authority decides using actual
signals, not one isolated transient request.

Application rollback means selecting the prior recorded image digests. Confirm
schema compatibility first. Do not automatically revert a migration; prefer a
forward repair and invoke disaster recovery only under the approved incident
procedure.

## Completion

- [ ] Smoke and observation evidence attached.
- [ ] Deployed digests, schema version and configuration revision recorded.
- [ ] Any waiver/incident/rollback recorded with owner and expiry.
- [ ] Release notes and handoff inventory updated.
- [ ] Temporary operator credentials removed and local validation resources stopped.
