# Production readiness checklist

Repository hardening is complete where checked. Deployment/vendor/security/load items
remain intentionally open and must be completed for the target environment.

## Application and data

- [x] PostgreSQL is authoritative; Redis/cache loss cannot lose business state.
- [x] Liveness and writable-PostGIS readiness are separate and privacy-safe.
- [x] API and all three workers use bounded graceful shutdown.
- [x] Pool, connection, statement, lock and idle-transaction timeouts are explicit.
- [x] Request/body/provider timeouts and worker retry jitter are bounded.
- [x] Data-integrity and operational-status commands exist.
- [x] Cleanup is dry-runnable, bounded, locked, idempotent and policy-limited.
- [x] Seller archive/SOLD chat remains writable; moderator removal is read-only.
- [ ] Set business/legal retention for audit, messages, notifications, reports and media rows.

## Recovery

- [x] Logical backup command has overwrite, partial-file and production-confirm guards.
- [x] Isolated real backup/fresh-restore/PostGIS/integrity workflow exists.
- [x] PostgreSQL, Redis, MinIO restart fault workflow exists and restores containers in `finally`.
- [x] Redis/BullMQ loss has durable media redispatch; DB workers use leases.
- [ ] Approve production RPO/RTO and backup schedule/retention.
- [ ] Configure encrypted, checksummed, off-site/object-locked database backups.
- [ ] Configure S3 versioning/replication/lifecycle and provider restore procedure.
- [ ] Execute and record a staging restore with production-equivalent data volume.

## Deployment and infrastructure

- [x] Application startup does not migrate and ORM synchronization is disabled.
- [x] Migration/runtime privilege separation and migration-failure procedure are documented.
- [x] Config rejects weak production secrets, insecure DB/Redis transport, insecure cookie and preview email.
- [x] CORS is one origin; proxy trust is an exact bounded hop count.
- [x] API Helmet and web CSP/frame/referrer/nosniff/permissions headers are configured.
- [x] Swagger is disabled by production default.
- [ ] Build production container images as non-root with read-only root filesystem, pinned base digest and resource limits.
- [ ] Select deployment/orchestrator topology, replica count and connection budget.
- [ ] Configure TLS termination, forwarded-header stripping and WebSocket upgrades; verify `TRUST_PROXY_HOPS`.
- [ ] Create least-privilege runtime/migration DB roles and S3 IAM policy in the target platform.
- [ ] Set Redis maxmemory/eviction/persistence and private TLS networking.

## Observability and operations

- [x] Structured logs include request duration/route template and slow request/job events without precise locations or content.
- [x] Backlog age/count, table size and duplicate-index inspection are available.
- [x] Alert conditions and incident/DR runbooks are documented.
- [x] Anonymous production smoke is non-destructive.
- [ ] Select and configure metrics/log/alert infrastructure and on-call routing.
- [ ] Define thresholds from load/soak baselines.
- [ ] Add backup/restore and integrity schedules with alerting.
- [ ] Decide distributed tracing and private metrics endpoint policy if needed.

## Providers and security

- [x] Email intent is durable; provider failure does not roll back marketplace actions.
- [x] Exact location, credentials, token values, message content and provider responses are excluded from operational logs/status.
- [x] Secret/JWT/cursor rotation consequences are documented.
- [ ] Complete dependency vulnerability triage for the exact release image.
- [ ] Verify real email gateway idempotency, quota, bounce and credential rotation in staging.
- [ ] Verify map provider CSP origins, quota and degraded LIST UX in browsers.
- [ ] Run OWASP-oriented authorization/security testing and an independent penetration test.

## Quality and capacity

- [x] Unit, HTTP, frontend, integration, migration and query-plan workflows exist.
- [x] Failure injection and pool exhaustion tests exist.
- [ ] Add Playwright multi-browser desktop/mobile critical flows.
- [ ] Run search/map/auth/messaging/media/fanout load tests and publish capacity findings.
- [ ] Run a multi-instance soak test including rolling API/worker restarts.
- [ ] Perform real staging/production deployment and manual provider/browser smoke.
