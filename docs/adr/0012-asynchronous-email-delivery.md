# ADR 0012: PostgreSQL-backed asynchronous email delivery

Status: accepted — 2026-09-26

## Context

Authentication, messaging, saved searches and moderation create events that may
also need email. Calling an external provider inside their database transaction
holds locks across an unreliable network call and still leaves a dual-write gap.
An in-app Notification and an external delivery attempt have different lifecycle,
preference and operational requirements.

## Decision

Keep Notification, preference and delivery as separate concepts. A business or
auth transaction writes a durable `notification_deliveries` intent in PostgreSQL.
Product notifications have a unique `(notification_id, channel)` delivery and
recheck the current typed preference, verified email and active account immediately
before send. Verification, recovery, email change and critical account-status
messages are mandatory and cannot be disabled.

A separate process claims bounded batches with `FOR UPDATE SKIP LOCKED`. PROCESSING
rows have a lease; retryable failures use bounded exponential backoff and permanent
failures become terminal. The provider-neutral `EmailSender` currently has one
production HTTPS gateway adapter and a deterministic preview adapter. Server-owned
templates produce escaped HTML and plain text. Stable delivery UUIDs are sent as
provider idempotency keys and deterministic Message-IDs.

## Alternatives

- Synchronous provider calls were rejected because provider latency/failure must
  not control business transaction duration or commit outcome.
- Redis/BullMQ as the only queue was rejected because pending email would not be
  atomic with PostgreSQL business state.
- A second generic event outbox was rejected; the existing domain outbox creates
  Notifications, while the delivery table owns channel-specific execution state.
- Multiple provider adapters/failover were deferred until an operational need is
  demonstrated.

## Consequences

API and engagement processes continue during provider outages while pending/retry
rows accumulate. Database constraints prevent replay duplicates. External delivery
is at least once: the HTTP gateway receives a stable idempotency key, but exactly-once
behavior ultimately depends on the provider honoring it. A crash after provider
acceptance and before `SENT` can otherwise produce a rare duplicate. Deployments
must run and monitor `worker:delivery`; API readiness deliberately does not depend
on provider availability.
