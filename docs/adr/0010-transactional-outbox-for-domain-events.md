# ADR 0010: PostgreSQL transactional outbox for Listing domain events

Status: accepted — 2026-09-25

## Context

Listing lifecycle facts must survive process crashes and can fan out to many
SavedSearch and Favorite notifications. Calling a delivery provider or an
ephemeral queue from the Listing transaction creates a dual-write gap. Redis is
already present for other responsibilities, but is not the source of truth for
marketplace state.

## Decision

Persist minimal versioned Listing events in PostgreSQL in the same transaction as
the business state change. A separate PostgreSQL worker claims bounded batches
with `FOR UPDATE SKIP LOCKED`, leases in-progress work, checkpoints bounded fanout
pages, and applies bounded retries. Processing is at-least-once. Notifications
deduplicate with `(userId, sourceEventId, type)`.

Use direct PostgreSQL consumption rather than an outbox-to-BullMQ hop. This keeps
one durability boundary and avoids a second publish/checkpoint failure window.
Direct single-recipient notifications may remain in the same transaction when
both the business change and notification are in this database. Network delivery
must happen after commit in a future delivery worker.

## Alternatives

- Best-effort in-process events lose work on crash and were rejected.
- Redis/BullMQ as the only event store cannot provide atomicity with Listing state.
- PostgreSQL outbox plus BullMQ remains possible if later throughput or scheduling
  needs justify the additional dispatcher and duplicate-delivery handling.
- Synchronous matching in moderation/seller requests would increase latency and
  make high-cardinality fanout part of the business transaction.

## Consequences

The database gains outbox storage and index/write overhead. Workers must be
idempotent and operations must monitor failed/stale events and apply retention.
Committed events survive application and Redis restarts. Multiple workers can run
safely. Future email, push, and realtime delivery can build on Notification IDs
without coupling external providers to Listing transactions.
