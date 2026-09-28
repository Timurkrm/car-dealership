# Release deployment verification

Date: 2026-09-28. Candidate: `0.1.0-rc.1`. The repository base commit during
local verification was `a714d2a220fc60896282cfd99f538de888b57248`.
Candidate changes remained in the working tree, so this SHA is not claimed as
the immutable identity of the locally built images. The final registry digest
must be produced by CI from the reviewed release commit/tag.

This is repository and local production-reference evidence. It is not evidence
that an external staging or production environment exists.

## Images and supply chain

- Backend and Web images build from pinned Node `24.21.0-bookworm-slim`
  multi-stage Dockerfiles.
- Final containers run as non-root, contain production dependencies and compiled
  runtime artifacts, and support the API, three workers and migration job.
- Final local image identities were
  `sha256:24a3bc9974202e166ff302ee6a9b21e65e67cd9e6b3825428bdfbea7fce760e7`
  for backend and
  `sha256:2d8f4631b9282906c0db977707357a6c3f2e42773ebdad5892d1b2f43bfe1421`
  for Web. These are local Docker identities, not published registry digests.
- Pinned Trivy `0.67.2` scans found zero unresolved Critical/High findings in
  both final images. npm production and full-tree audits found zero known
  vulnerabilities. The SPDX 2.3 SBOM contains 146 packages.

## Reference topology

The reference Compose stack ran Caddy with local TLS, Web, two independent API
replicas, Media/Engagement/Delivery workers, a one-shot migration job,
PostgreSQL/PostGIS, Redis and private MinIO. Application containers ran from the
release images with read-only filesystems, bounded temporary mounts, dropped
capabilities and `no-new-privileges`.

The final migration job exited successfully with no pending migration. Public
metrics access returned 404 while both internal API replicas exposed the metrics
contract. Shared sessions, Redis rate limiting and Socket.IO fanout worked across
replicas. Rolling API restarts completed with 136 successful health requests,
zero failed requests and no duplicate authoritative message.

## Proxy, browser and load

The TLS-proxy browser flow covered Cars, Parts, Map, login, authenticated
messaging WebSocket, message send and logout. The complete browser matrix passed
27/27 scenarios across Chromium, Firefox, WebKit and iOS/Android emulation. The
separate security run passed 4/4 tests covering headers/CSP/origin, injection and
query bounds, IDOR/RBAC, body limits, mass assignment and blocked login.

A 10-second, concurrency-2 mixed smoke ran through Caddy and both API replicas:
3,054 total requests, 0 unexpected errors and 0 server errors. Accepted endpoint
p95 values ranged from 9.15 ms for notifications to 325.15 ms for Argon2 login.
The 71.709% throttled share is expected because the trusted ingress collapses
spoofed client headers to the real local source identity; 429 responses are
reported separately. These figures are local development observations, not an
SLA or capacity forecast.

## Data, recovery and query plans

The isolated backup/restore drill restored users, Cars, Parts, media, messaging,
notifications, outbox, moderation and PostGIS data and found zero integrity
violations. Redis, PostgreSQL and MinIO restart fault scenarios recovered, and
dependency outages returned controlled unavailable responses. Cleanup dry-run,
operational status and integrity checks completed without failed categories.

Search/Geo plans used published partial indexes, GiST geography indexes and KNN
distance ordering on 55,003 listings. Moderation, engagement, messaging and
delivery plan reviews used their intended indexes on datasets up to 300,000
messages and 100,000 deliveries. The broad Vehicle map plan was the slowest
measured search plan at 292.37 ms locally; target staging must establish its own
thresholds and scaling decisions.

## Media capacity

The production-image Media worker processed 6/6 deterministic JPEGs, including
two concurrent 38.44 MP sources, with no failure. The short local batch measured
633 ms p50, 1,192 ms p95/max and 300.5 MiB peak sampled RSS. See
[Media worker capacity](media-capacity-report.md) for the sizing limits and
caveats.

## External gates

Approval and commit/tag of the candidate, registry publication and digest
promotion, client staging, DNS/trusted TLS,
managed PostgreSQL/Redis/S3, real email/map providers, monitoring/on-call,
managed PITR/restore, approved RPO/RTO and retention, and any independent
penetration test remain **PENDING EXTERNAL**.
