# ADR 0002: Marketplace persistence and history boundaries

- Status: Accepted
- Date: 2026-09-17
- Follows: [ADR 0001](0001-modular-monolith.md)

## Context

The engineering foundation has no marketplace tables. The next stage needs
relational integrity and PostGIS-ready geographic queries while preserving module
ownership, private credentials/location and durable moderation/security history.
Authentication, public APIs and product state machines are outside this stage.

## Decision

Add one reviewed reversible initial marketplace migration after existing PostGIS.
Keep entities inside their owning modules and register them centrally at the ORM
composition root. Use UUIDs, timezone-aware timestamps, BIGINT minor-unit prices
represented as TypeScript strings, explicit FKs and access-pattern indexes.

Separate credentials from profiles to preserve auth ownership. Device session UUID
also identifies the refresh family; a child token-hash history preserves consumed
digests for later reuse detection. Multiple stable roles use a composite-key join
table. Mutable categories/statuses use varchar + CHECK; make/model/generation use
catalog tables. A composite generation/model FK prevents inconsistent vehicle
classification. VIN is normalized/private but not globally unique.

Vehicle specifications and commercial listing lifecycle remain separate. Listing
writes require atomic version comparison; the ORM VersionColumn alone is
insufficient. Separate exact/private geometry(Point,4326) from optional supplied
public geometry. Geometry and cast-geography GiST indexes serve degree envelope
and metre radius/KNN operations respectively. No public precision policy is guessed.

Report and moderation targets use a closed three-type discriminator, three
concrete nullable FKs and an exclusive-target CHECK. This preserves one queue
and actual referential integrity without a polymorphic orphan reference or trigger.
Audit targets instead remain historical UUID/type references without target FKs;
actor deletion uses SET NULL. History links RESTRICT accidental deletion and
account removal uses controlled anonymization/retention. Only disposable child
data uses CASCADE.

Use JSONB only for versioned saved filters, event payloads and bounded internal
metadata. Audit writes have an append-only public boundary with allowlisted
machine metadata and optional caller transaction context. ORM sensitive columns
are excluded from ordinary selects; future APIs must use explicit DTOs and
authorization. Database privilege provisioning/retention workflows are deferred.

## Alternatives

- Native PostgreSQL enum types: strong typing, but shared enum alterations and
  down migrations are harder; localized CHECK migrations are simpler here.
- Password fields in users: fewer tables, but profile and authentication ownership
  would be mixed and accidental credential reads easier.
- One overwritten refresh hash per session: fewer rows, but consumed-token reuse
  evidence would disappear during rotation.
- Unchecked polymorphic report targets: easy extension, but no ordinary FK
  integrity. Separate report tables duplicate queue/status handling for a small
  fixed set of target types.
- CASCADE everywhere or deletedAt everywhere: simpler-looking generic handling,
  but accidental loss of security history and ambiguous retention semantics.
- One geometry GiST only: serves envelopes, but cannot index cast-geography metre
  queries. A geography expression index adds justified write/storage cost.

## Consequences

There are 21 tables including justified credential and rotation-history tables.
Adding target/category types requires migrations. Exact coordinates and history
remain private unless intentionally selected. Full authorization, token expiry,
state transitions and payload schemas are still application obligations.
Production needs a separate migration/retention DB role and restricted runtime
history privileges; append orientation is not a tamper-proof audit claim.

Real PostgreSQL/PostGIS tests create an owned empty database, verify apply/down/
reapply, ORM diff, constraints, spatial operators and concurrent CAS. The optional
catalog seed is idempotent and prohibited in production. Detailed fields, index
costs and deletion behavior are documented in [data-model.md](../data-model.md).
