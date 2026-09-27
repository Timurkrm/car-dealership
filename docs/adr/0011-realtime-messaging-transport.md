# ADR 0011: Socket.IO with Redis for messaging realtime

## Context

Private buyer/seller messages must be durable, work across multiple API instances and
update conversations and notifications without page reload. Existing PostgreSQL and
transactional outbox infrastructure already provide durable state and replay.

## Decision

PostgreSQL remains authoritative. A message and `MESSAGE_CREATED` outbox event commit in
one transaction. Socket.IO provides the browser transport, the official Redis adapter
distributes server rooms, and the Redis emitter lets background workers publish to the
same user rooms. Access JWTs are sent in Socket.IO auth data, then checked against the
persisted session and user on connect and at bounded intervals. Clients reconcile from
owner-scoped cursor HTTP endpoints after reconnect.

## Alternatives

Raw WebSocket would require rebuilding namespaces, acknowledgements, reconnect and
multi-instance room distribution. Redis Streams as a message store would duplicate
PostgreSQL authority. Database polling alone would be durable but would add latency and
continuous read load. A separate realtime service would add operational boundaries that
the current scale does not justify.

## Consequences

Realtime delivery can be duplicated or missed, so clients deduplicate and reconcile.
Redis failure can degrade live updates but cannot lose committed messages. Socket-only
transport avoids sticky-session requirements. The gateway and public HTTP contracts can
later move behind a separate service without changing the persistence semantics.
