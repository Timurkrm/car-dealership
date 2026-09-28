# Known limitations and deferred work

## Release limits

- No real client staging/production environment, DNS, trusted certificate,
  registry publication, managed service or provider credential was available.
  Those gates are **PENDING EXTERNAL**.
- Local reference Compose validates process contracts and failure behavior; it is
  not an HA enterprise database/Redis/S3 design and local Windows measurements do
  not establish a production SLA.
- Real email idempotency/quota/bounce behavior and real map style/tile quota/CSP
  behavior require staging credentials.
- Managed PostgreSQL PITR and object-store restore have not been exercised in a
  client account or at production data volume.
- RPO/RTO, retention/privacy/terms/cookies/email policy, catalog master data and
  license/IP remain client business/legal decisions.
- Internal security suites and scans do not replace an independent penetration
  test. Playwright device profiles are emulation, not a physical-device lab.
- Distributed tracing is not installed. Structured logs, request IDs and metrics
  provide the current correlation model.
- PostgreSQL/PostGIS search is appropriate for current structured filters and
  clustering. Monitor broad viewport/query load; consider read replicas,
  precomputed/vector tiles or a secondary search index only when measured demand
  justifies them.
- Map clustering is bounded/server-assisted; dense global views may be truncated
  and require zooming. Free-text typo tolerance and personalized ranking are not
  included.
- The development reference catalog is intentionally small and prohibited in
  production; client-approved master catalogs need a controlled import.

## Post-launch backlog

Prioritize from measured incidents and product needs:

1. extended multi-instance soak in the target orchestrator, including worker and
   managed-service failover;
2. independent penetration test and physical-device/accessibility lab;
3. provider failover/quota automation and managed PITR recovery exercises;
4. account data export/deletion after legal policy approval;
5. optional notification/email digest behavior;
6. advanced geo scaling/vector tiles or a secondary search engine if target
   workload demonstrates the need.

This backlog is not part of `0.1.0-rc.1` and should not be implemented without a
separate approved scope.
