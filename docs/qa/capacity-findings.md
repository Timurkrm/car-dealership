# Capacity findings

The release packaging stage also ran a real media pipeline batch. See
[Media worker capacity](media-capacity-report.md) for fixture, p50/p95 throughput,
peak RSS and initial staging sizing.

## Observed range

On the documented development machine, the mixed workload remained correct at
about 59-60 accepted requests/s at concurrency 10 and 30. The stress run produced
no unexpected errors, pool collapse or timeout storm. The 30-minute soak held
49.93 accepted requests/s and 56.64 total requests/s with zero unexpected errors.
This is an observed local range and must not be used as a production capacity
commitment.

## First bottleneck

Broad/low-zoom map aggregation and radius/nearest PostGIS queries saturated
first. From baseline to stress, broad-map p95 rose from 833.90 ms to 1560.36 ms
and nearby p95 from 394.83 ms to 1463.96 ms. Exact facets were the next visible
aggregation cost. Search list p95 remained 214.19 ms at stress.

Query-plan review on 55,003 listings selected the intended partial B-tree and
GiST indexes. A broad Vehicle map plan measured 284.557 ms in isolation; the
corresponding Parts broad-compatibility plan measured 208.203 ms. Under concurrent
load the database work, rather than Node routing, dominates. Do not add a
high-cardinality geo response cache without an invalidation design.

## Domain observations

- Cars newest, price, model/year and geography use the expected published/search
  indexes. The isolated model/year/price plan measured 40.999 ms.
- Parts category/brand/OEM/manufacturer plans measured 0.228-1.955 ms; a broad
  compatibility plan measured 208.203 ms. The mixed HTTP compatibility p95 was
  251.63 ms at stress.
- Message cursor plans on 300,000 messages measured 0.019-0.299 ms. HTTP message
  history p95 was 255.25 ms only after the overall system reached stress
  saturation.
- A bounded message/outbox/email worker run drained 40 events in 3.21 seconds with
  zero remainder and delivered all 40 realtime events.
- Argon2 login measured about 190 ms p95 in a four-request smoke sample. Scale
  authentication CPU independently; do not reduce password-hash strength.
- The soak ended with all 10 WebSocket clients connected, no reconnect errors,
  no durable queue backlog and stable process handle counts. API RSS ended well
  below its early warm-up maximum.
- Controlled single-component restarts recovered in 2.62-8.14 seconds locally,
  with zero unexpected traffic outcomes and zero tested integrity findings.

## Scaling order

1. Establish production-sized low-zoom map and nearby measurements on staging.
2. Scale PostgreSQL CPU/IO and read capacity, and validate pool budgets across API
   replicas before increasing application concurrency.
3. If low-zoom traffic warrants it, optimize server-side grid aggregation or add
   a bounded derived map representation. Preserve public-point privacy.
4. Scale stateless API replicas and workers separately from the database.
5. Recheck provider-backed email and representative media throughput in staging.

The current map contract already supports truncation/clustering, so the client
does not require every point. No evidence from this test justifies OpenSearch,
vector tiles or a generic search-result cache yet.
