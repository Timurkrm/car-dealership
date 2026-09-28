# Monitoring and alert routing

The API exposes Prometheus text format at `/api/internal/metrics` only when
`METRICS_ENABLED=true`. Public ingress must return 404 for this route. Scrape it
over a private authenticated/mTLS monitoring network or protect it with the
platform's service identity. The repository provides example scrape and alert
rules under `infra/prometheus`; selection of the monitoring vendor and pager is
**PENDING EXTERNAL**.

## Signals

- `marketplace_http_requests_total` and
  `marketplace_http_request_duration_seconds` use method, route template and
  status class only.
- `marketplace_http_5xx_total` captures aggregate server failures.
- `marketplace_db_pool_connections{state=active|idle|waiting}` exposes each
  process pool pressure.
- `marketplace_websocket_connections` exposes current authenticated sockets per
  API replica.
- `marketplace_outbox_*` and `marketplace_delivery_*` expose durable backlog,
  retry/failure state and oldest pending age.
- `marketplace_media_items{state=processing|failed}` exposes media state.

Structured JSON logs carry service/environment, operation, request ID, route
template, status and duration. Slow request/job logs use configured thresholds.
They exclude tokens, cookies, passwords, message bodies, exact coordinates,
emails, provider payloads and storage keys. Central log ingestion must preserve
JSON fields and redact at the edge as a second control.

## Alert ownership and response

| Severity | Condition                                                                                                  | Initial owner                                                 | Runbook                                                                |
| -------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------- |
| P1       | no ready API capacity, suspected data corruption, auth bypass, DB unavailable beyond failover objective    | SRE + application incident commander + Security as applicable | [Dependency outage / incident response](runbook.md#incident-checklist) |
| P2       | sustained 5xx/latency, DB waiters, old outbox/delivery backlog, media failures, Redis/S3/email degradation | SRE, then owning application module                           | [Dependency and backlog response](runbook.md#dependency-incidents)     |
| P2       | backup missed/failed, restore/integrity check failed                                                       | SRE/DBA                                                       | [Disaster recovery](../disaster-recovery.md)                           |
| P3       | capacity trend, cleanup backlog, provider quota trend, single worker unavailable with redundancy           | owning team during business/on-call policy                    | [Capacity](runbook.md#table-and-index-maintenance)                     |

Prometheus rule thresholds are conservative bootstrap values and must be replaced
with staging baselines and approved objectives. Application metrics cannot see
managed database disk/WAL/replication, Redis memory/failover, S3 quota/durability,
provider quota or certificate expiry; configure those in provider monitoring.

## Monitoring smoke

Before production:

1. scrape every API replica internally and verify public denial;
2. generate a synthetic request and confirm metric/log correlation by request ID;
3. trigger a non-paging test alert through the real routing tree;
4. verify the receiver acknowledges it and every alert contains environment,
   service, severity, dashboard and a specific runbook link;
5. confirm alert labels contain no query string, user/listing ID, coordinates or
   personal content.

These vendor-specific checks are **PENDING EXTERNAL**.
