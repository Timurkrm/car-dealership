# Load and stability test report

## Environment

Measurements are development observations, not a production SLA or traffic
forecast.

| Item       | Value                                                                            |
| ---------- | -------------------------------------------------------------------------------- |
| CPU        | Intel Core i5-11400H, 12 logical CPUs                                            |
| RAM        | 16.8 GB                                                                          |
| OS         | Windows 10.0.26200                                                               |
| Node.js    | 24.21.0                                                                          |
| PostgreSQL | 17.5 with PostGIS                                                                |
| Redis      | 7.4.11                                                                           |
| Dataset    | deterministic 20,000 additional published Vehicle listings plus full E2E fixture |
| API pool   | maximum 20 connections                                                           |

The runner uses unique controlled proxy identities for anonymous traffic. This
keeps public-search testing from measuring one-IP throttling while preserving the
normal production limiter. Protected single-user endpoints retain actor limits.

## Profiles and acceptance

| Profile  | Duration | Concurrency | Purpose                                           |
| -------- | -------: | ----------: | ------------------------------------------------- |
| smoke    |     10 s |           2 | runner and endpoint validation                    |
| baseline |     30 s |          10 | initial mixed technical baseline                  |
| stress   |     45 s |          30 | saturation and graceful degradation               |
| soak     |   30 min |          10 | sustained latency, resources, sockets and backlog |

The engineering gate is under 1% unexpected errors, no timeout storm or data
corruption, bounded pool/resource use, and drained durable queues. HTTP 429 from
an intentionally exceeded actor limit is reported separately and is not counted
as a server error.

## Mixed workload results

| Profile  | Requests | Total req/s | Accepted req/s | Unexpected errors | Throttled |
| -------- | -------: | ----------: | -------------: | ----------------: | --------: |
| smoke    |      235 |       23.50 |          23.50 |                0% |        0% |
| baseline |    1,934 |       64.47 |          60.33 |                0% |    6.412% |
| stress   |    2,958 |       65.73 |          59.42 |                0% |    9.601% |

Baseline and stress latency, in milliseconds:

| Group                   | Baseline p50/p95/p99     | Stress p50/p95/p99          |
| ----------------------- | ------------------------ | --------------------------- |
| Search list             | 69.09 / 111.67 / 142.26  | 140.99 / 214.19 / 248.37    |
| Broad map               | 649.35 / 833.90 / 919.33 | 1305.67 / 1560.36 / 1640.94 |
| Facets                  | 218.84 / 310.29 / 351.34 | 574.93 / 811.84 / 867.86    |
| Nearby                  | 289.97 / 394.83 / 437.22 | 1173.25 / 1463.96 / 1514.09 |
| Detail                  | 31.47 / 53.25 / 61.63    | 329.24 / 882.43 / 1021.94   |
| Parts compatibility     | 28.28 / 41.46 / 55.00    | 187.05 / 251.63 / 272.29    |
| Favorites, accepted     | 48.24 / 68.81 / 103.22   | 100.36 / 138.16 / 146.31    |
| Notifications, accepted | 23.62 / 36.19 / 56.87    | 87.22 / 118.02 / 170.02     |
| Message history         | 19.58 / 42.87 / 54.95    | 190.54 / 255.25 / 278.78    |

The accepted throughput plateaus near 60 requests/s on this machine while
concurrency rises from 10 to 30. Broad map and nearest/radius PostGIS work
saturate first. There were no 5xx or transport failures. Favorites and
notifications reached their intended per-actor rate limits.

## Authentication and workers

The low-rate smoke login sample (four real Argon2 requests) measured
178.72/190.30/190.30 ms p50/p95/p99. It is intentionally separated from the
main baseline because password hashing is CPU-bound and its parameters were not
weakened for the benchmark.

A bounded worker traffic run accepted 40/40 message writes in 7.40 seconds
(5.41/s), with 41.32/128.66/131.14 ms p50/p95/p99. It observed all 40 realtime
events and created 40 outbox events, notifications and email deliveries. The
engagement and preview-delivery workers drained both durable queues to zero in
3.21 seconds. The provider was local preview; this does not characterize a real
email provider.

Media processing correctness, retries and Sharp resource boundaries run against
real MinIO in integration tests. A dedicated representative-image throughput
number is not asserted as production capacity in this local report.

## Soak and integrity

The 30-minute soak completed 101,946 requests at concurrency 10: 56.64 total and
49.93 accepted requests/s. The 11.849% throttled share came from deliberately
reusing one actor against protected favorites, notifications and messages; it is
reported separately. Unexpected errors were 0%.

| Group               | Requests | Accepted | p50/p95/p99 ms            |
| ------------------- | -------: | -------: | ------------------------- |
| Search list         |   24,480 |   24,480 | 67.71 / 102.98 / 127.86   |
| Broad map           |   12,240 |   12,240 | 689.93 / 916.27 / 1823.94 |
| Facets              |    5,100 |    5,100 | 231.37 / 348.35 / 442.15  |
| Nearby              |   12,233 |   12,233 | 332.91 / 464.81 / 1643.14 |
| Detail              |   15,285 |   15,285 | 31.69 / 50.22 / 67.85     |
| Parts compatibility |    8,152 |    8,152 | 26.31 / 41.42 / 54.55     |
| Favorites           |    8,152 |    2,760 | 39.22 / 64.05 / 83.24     |
| Notifications       |    8,152 |    2,640 | 21.55 / 39.55 / 49.83     |
| Messages            |    8,152 |    6,976 | 18.01 / 36.19 / 57.14     |

The 62 resource samples had no monitoring error. PostgreSQL connections ranged
from 7 to 33 with at most 19 active. The API RSS rose from 237 MB to an early
426 MB maximum and ended at 297 MB; handles moved from 269 to 296. Media,
engagement and delivery workers ended at 248/119/119 MB with stable or lower
handle counts. Durable queue samples remained at zero. Ten WebSocket clients
were connected at completion after 30 planned reconnects, with no connection
error. A live Redis sample during the run observed 15 clients and one blocked
worker connection; the completed report predates per-interval Redis samples.

The controlled fault-under-load run restarted the API, Redis, PostgreSQL and the
engagement worker while search traffic and a WebSocket client remained active.
It recorded 80 successful requests, 64 expected unavailable responses, zero
unexpected responses and 20/20 final recovery requests. Measured local recovery
was 3.41 s for API, 8.10 s for Redis, 8.14 s for PostgreSQL and 2.62 s for the
worker. Redis returned the intended dependency-unavailable response; PostgreSQL
outage requests failed safely and recovered. The WebSocket reconnected after the
outages.

Post-load integrity uses `ops:verify-data`; it checks critical orphans,
cross-subtype consistency, dangling notification/outbox relationships and stale
leases. The fault run and final verification reported zero Vehicle/Part subtype,
message-orphan, delivery-orphan or other critical consistency findings.

Runtime JSON under `qa-results/` is ignored by Git and retained as a CI/manual
run artifact.
