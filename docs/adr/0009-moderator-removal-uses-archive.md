# ADR 0009: Moderator removal uses ARCHIVED plus immutable history

## Context

Published Cars and Parts must be removable after a violation. The existing shared Listing lifecycle already uses `ARCHIVED` for a non-public terminal state. Adding `REMOVED` would affect seller flows, public/search/map predicates, persisted status checks and every client.

## Decision

A moderator removal transitions `PUBLISHED → ARCHIVED`. It also appends `ModerationAction(action=REMOVE_LISTING)` with structured seller/internal reasons and `AuditLog(action=LISTING_REMOVED_BY_MODERATOR)`. The seller notification identifies the moderation result. Seller archive continues to use its existing audit action, so the cause remains distinguishable.

## Alternatives

- Add a `REMOVED` Listing status. Rejected because the public behavior is already represented by ARCHIVED and a second terminal status would spread through every listing consumer.
- Delete the Listing. Rejected because reports, conversations, audit and appeal/investigation history require stable references.

## Consequences

Search and Map exclude a removed listing through their existing `status=PUBLISHED` predicate. Historical/admin views use immutable moderation/audit records to distinguish moderator removal from seller archive. A future revision/appeal workflow may justify a new state, but this decision does not invent one prematurely.
