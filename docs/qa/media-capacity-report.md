# Media worker capacity check

Date: 2026-09-28. Environment: local Windows Docker Desktop production-like
reference topology, release image `marketplace-backend:0.1.0-rc.1`, one media
worker, `MEDIA_WORKER_CONCURRENCY=2`, PostgreSQL/Redis/MinIO containers.

`npm run benchmark:media` created one disposable draft listing, uploaded six
deterministic patterned JPEG sources through the real initialize/complete API and
private S3 contract, waited for real Sharp variants, sampled container RSS, then
removed database fixture rows. Two near-limit images were dispatched first to
exercise concurrent high-pixel decoding.

| Profile          | Dimensions           | Source sizes              |
| ---------------- | -------------------- | ------------------------- |
| card             | 1280×960             | 99,528–106,395 bytes      |
| large            | 3000×2000            | 518,149–540,840 bytes     |
| near pixel limit | 6200×6200 (38.44 MP) | 3,248,455–3,297,515 bytes |

Observed development results:

- 6/6 images reached `READY`, 0 failed;
- elapsed 1.19 s, 301.76 images/minute for this short synthetic batch;
- completion-to-processed latency p50 633 ms, p95/max 1,192 ms;
- peak worker RSS sample 300.5 MiB;
- source sizes stayed below the configured 15 MiB and decoded pixels below the
  configured 40 MP bound.

The batch is deliberately short and patterned JPEGs are more compressible than
customer photos. Docker stats produced one peak sample, so the value is evidence
for initial sizing rather than a precise memory distribution. Start staging with
one worker at concurrency 2, a memory limit no lower than 512 MiB and a bounded
1 GiB temporary volume, then adjust from a longer corpus of approved representative
photos. Alert on restarts/OOM, processing age/failures and temporary-disk pressure.
Do not treat throughput as a production SLA; storage/network/provider latency and
real image entropy must be measured in target staging.
