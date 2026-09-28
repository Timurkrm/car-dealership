# Production readiness checklist

The final QA evidence is recorded in [QA sign-off](../qa/qa-signoff.md). A
release candidate must have a green Chromium critical suite, the scheduled
browser matrix, security suite, load smoke, integration suite and production
build. Stress and 30-minute soak are manual/scheduled gates before production
capacity sign-off.

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
- [x] Build and inspect version-pinned production images; reference containers run non-root/read-only with dropped capabilities.
- [x] Document vendor-neutral process topology, replica/pool budget method and dedicated migration job.
- [x] Validate TLS termination, forwarded routing, WebSocket upgrades and metrics denial in the local reference proxy.
- [x] Run the Cars/Parts/Map/login/realtime/logout browser journey through the production-like TLS proxy.
- [ ] Pin/approve base-image digests and set target-orchestrator CPU/memory/temp-storage limits.
- [ ] Select the client orchestrator, actual replica counts and provider connection budget.
- [ ] Configure trusted production TLS/forwarded-header stripping and verify actual `TRUST_PROXY_HOPS`.
- [ ] Create least-privilege runtime/migration DB roles and S3 IAM policy in the target platform.
- [ ] Set Redis maxmemory/eviction/persistence and private TLS networking.

## Observability and operations

- [x] Structured logs include request duration/route template and slow request/job events without precise locations or content.
- [x] Backlog age/count, table size and duplicate-index inspection are available.
- [x] Alert conditions and incident/DR runbooks are documented.
- [x] Anonymous production smoke is non-destructive.
- [x] Prometheus-compatible low-cardinality HTTP, pool, WebSocket and durable-backlog metrics exist behind an internal endpoint.
- [x] Example scrape/rules and severity/runbook routing contract exist.
- [ ] Select and configure metrics/log/alert infrastructure and on-call routing.
- [ ] Define thresholds from load/soak baselines.
- [ ] Add backup/restore and integrity schedules with alerting.
- [ ] Configure the client private scrape identity and verify alert routing.
- [ ] Decide distributed tracing policy if needed.

## Providers and security

- [x] Email intent is durable; provider failure does not roll back marketplace actions.
- [x] Exact location, credentials, token values, message content and provider responses are excluded from operational logs/status.
- [x] Secret/JWT/cursor rotation consequences are documented.
- [x] Complete repository dependency audit and internal secret scan for this release candidate.
- [x] Scan final Web/backend images with pinned Trivy policy; no Critical/High findings remain.
- [ ] Verify real email gateway idempotency, quota, bounce and credential rotation in staging.
- [ ] Verify map provider CSP origins, quota and degraded LIST UX in browsers.
- [x] Run OWASP-oriented internal authorization/security testing.
- [ ] Complete an independent penetration test if required by release risk policy.

## Quality and capacity

- [x] Unit, HTTP, frontend, integration, migration and query-plan workflows exist.
- [x] Failure injection and pool exhaustion tests exist.
- [x] Add Playwright multi-browser desktop/mobile critical flows.
- [x] Run mixed search/map/auth/messaging and bounded outbox/fanout load tests and publish capacity findings.
- [x] Run a bounded local production-image media benchmark including concurrent near-pixel-limit sources and record initial sizing.
- [ ] Repeat representative media and real-provider delivery throughput tests in target staging.
- [x] Run a 30-minute single-instance soak with DB/Redis/process/socket/backlog observation.
- [x] Run controlled API, Redis, PostgreSQL and engagement-worker restarts under traffic.
- [x] Run two-API session, shared limiter, cross-instance realtime and rolling API restart smoke without authoritative duplicates.
- [x] Run a bounded mixed-workload smoke through the two-API production-like proxy with zero unexpected errors.
- [ ] Run an extended multi-instance soak including rolling worker restarts in target staging.
- [ ] Perform real staging/production deployment and manual provider/browser smoke.
