# ADR 0004: isolate vehicle observations when editing an offer

Status: accepted. Date: 2026-09-18.

## Context

The existing schema intentionally permits multiple listings to reference one
Vehicle observation. VIN is not a unique vehicle identity and historical resale
offers must remain meaningful. In-place specification edits through one seller
offer would silently change other current or archived offers. Adding a global
one-listing-per-vehicle uniqueness rule would break this persisted capability.

## Decision

Every new draft creates its own observation. A DRAFT/REJECTED specification edit
that actually changes values creates a fresh Vehicle and atomically CAS-relinks
only the edited Listing. Existing observations are never updated by product APIs.
Vehicle creation, listing CAS, location replacement and audit commit together.
There is no public arbitrary vehicle-ID reuse/edit API. No new schema is required
for this isolation policy. Prices, descriptions and locations remain Listing
operations; PUBLISHED/SOLD/ARCHIVED specifications cannot be edited.

## Alternatives

- In-place editing: smallest write, but corrupts other offers' meaning.
- Unique vehicle ID per listing: removes historical sharing and needs a breaking
  data migration, contrary to the existing model.
- Clone only when shared: reduces rows but introduces reference-count/locking
  protocol across current and future reuse writers; more complex correctness.
- Full revision/event-sourcing tables: premature for the seller draft workflow.

## Consequences

Offer isolation is explicit and testable, including an already shared historical
Vehicle. Specification edits change the observation UUID; clients should identify
the offer by Listing UUID. Old unreferenced observations remain stored. This does
not constitute an accessible revision history: no retrieval, retention job or
physical-vehicle deduplication is claimed. A future retention policy may remove
only observations with no protected references; it must not silently overwrite
historical offers. Media/published-edit/moderation revision design remains separate.
