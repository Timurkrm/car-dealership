# ADR 0005: Private direct uploads and asynchronous photo re-encoding

## Context

Vehicle photos are untrusted large inputs. Processing them inside API requests risks
resource exhaustion and latency; publishing originals leaks EXIF and unsafe content.
PostgreSQL and S3/Redis cannot share an atomic transaction. Listings already own the
seller lifecycle and row locking; Media owns photo persistence.

## Decision

Use short-lived scoped direct S3 PUT, private source staging, HEAD confirmation and
bounded ETag-pinned reads. A separate process in the modular monolith consumes BullMQ
jobs using the installed node-redis driver. The media row is the durable processing/
cleanup outbox, redispatched periodically. Sharp decodes limited JPEG/PNG/WebP, applies
orientation, strips metadata and generates three immutable WebP variants. Attempt
UUIDs fence writes; token/state CAS fences final publication. Source retention ends
after upload expiry plus grace. Logical deletion and revisitable tombstones reconcile
storage failures and stale worker writes.

Listing-owned MediaPort supplies read projections and submit validation. Composition
root dynamically wires MediaReadModule into ListingsModule and that same configured
ListingsModule into MediaModule. Media calls the exported ListingAccess application
facade. This avoids a Listings ↔ Media module cycle, private table access and forwardRef.
The common listing row lock serializes all photo mutations and submission.

## Alternatives

API multipart uploads would increase API bandwidth/timeout risk. Synchronous decoding
would block HTTP capacity. Public originals or trusted MIME would violate privacy and
validation boundaries. Redis-only enqueue could lose committed work. A general-purpose
outbox/event platform is unnecessary for this bounded workflow. A public CDN/bucket
would need a different visibility/cache/revocation policy; defer vendor integration.

## Consequences

Deploy a worker with native sharp prebuilds, bounded concurrency/memory and persistent
Redis; PostgreSQL can recover lost dispatch. PUT lacks a provider-enforced byte ceiling,
so actual oversized uploads can temporarily consume private storage before rejection;
provider quotas complement server checks. Presigned GET grants access until its short
expiry even after a state change; no immediate revocation claim is made. Cleaned sources
cannot support future original reprocessing; upload again instead. Tombstone retention
and production quotas/resource limits need operational policy. Legacy unvalidated media
must be re-uploaded. Browser E2E remains a separate testing capability.
