# Alert recommendations

These are conditions for the future monitoring platform. No alerting backend is
installed, so this document does not claim that any alert currently pages an operator.
Thresholds need baseline data from staging/load tests and production traffic.

| Signal           | Recommended condition                                                                                       | Why / response                                                     |
| ---------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| API readiness    | sustained non-200 or ready-instance count below redundancy target                                           | PostgreSQL/write path or shutdown; inspect DB before restart loops |
| API liveness     | process unavailable                                                                                         | crash/event-loop/container failure                                 |
| HTTP errors      | sustained 5xx increase by route template                                                                    | regressions/dependency failure; never label by URL/query/user      |
| HTTP latency     | slow-request event rate or route-template percentile above tested baseline                                  | inspect DB/provider/pool saturation                                |
| PostgreSQL       | connections near deployment budget, acquisition timeout, deadlocks, read-only, disk/WAL/autovacuum pressure | protect authoritative store and scale/tune deliberately            |
| Outbox           | oldest PENDING/RETRY age or FAILED count grows                                                              | engagement/notification processing is stalled                      |
| Email delivery   | oldest PENDING/RETRY age, FAILED increase, provider 429/5xx                                                 | provider outage/quota/credential issue; avoid retry storm          |
| Media            | PROCESSING stale age, FAILED increase, Redis/BullMQ unavailable                                             | worker/storage/queue recovery required                             |
| Redis            | connection unavailable/reconnect warnings, memory/eviction pressure                                         | rate limiting and realtime/media degradation                       |
| S3               | bucket probe failure, quota/capacity or 5xx                                                                 | uploads/images/worker affected; core API may remain ready          |
| Backup           | scheduled backup missing, checksum failure, age exceeds RPO                                                 | no verified recovery point                                         |
| Restore drill    | scheduled restore or integrity check fails                                                                  | backup is not proven recoverable                                   |
| Integrity        | `ops:verify-data` exit 2                                                                                    | correctness incident; investigate before cleanup                   |
| Cleanup          | repeated failure, advisory-lock contention, eligible rows grow                                              | retention backlog or stuck scheduler                               |
| Process shutdown | `process_shutdown_failed` or forced termination                                                             | inspect active requests/jobs and recovered leases                  |
| External map     | provider error/quota from browser/provider monitoring                                                       | LIST remains usable; coordinate provider response                  |

Use bounded labels: service, environment, operation, route template, result and provider.
Never label/log query strings, raw coordinates, email, user ID, message body, tokens or
storage keys. Preserve `requestId`, durable entity/job ID and operation for correlation.

The next testing stage should establish practical latency/error/backlog thresholds via
load and soak tests. Database/provider alerts also belong in their managed-service
monitoring because an application process cannot observe disk, replication and quota
health reliably.
