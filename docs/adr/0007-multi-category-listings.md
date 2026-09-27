# ADR 0007: Shared marketplace listings with explicit product subtypes

Status: Accepted

## Context

Vehicle offers already have stable IDs referenced by Media, location, favorites,
conversations, reports, moderation and audit. Adding automotive parts must preserve
those IDs and systems, without nullable vehicle/part fields accumulating on the root.

## Decision

Listings owns `listings` (seller, money, lifecycle, timestamps, version and type),
`vehicle_listings` (vehicle observation link), and `part_listings` (part link and
available quantity). Vehicles owns specifications and its make/model/generation
catalog. Parts owns product specifications, category adjacency, brands and fitments.
Common resources continue to refer exclusively to Listing.id.

Each subtype has a constant checked type and composite FK to root `(id,type)`;
its listing ID is its PK. This prevents mismatched and cross-type links. A unique
part link prevents multiple offers mutating the same product specification. Vehicle
observations can still be shared historically and edits use existing copy-on-write.
Application transactions create exactly one subtype with its root; missing subtypes
are an application invariant. No constraint triggers are introduced. External writers
must use the application contract; migrations/repair tooling must preserve this invariant.

Public and owner contracts are discriminated unions, not a single DTO with optional
product graphs. Existing vehicle-specific creation/edit/detail paths remain vehicle
contracts. Shared seller detail/list, lifecycle and media accept either subtype.
Part-specific edit uses its own payload route; common transitions are not duplicated.

The reversible migration backfills subtype links before dropping root vehicle_id.
Rollback takes table locks and refuses any Part products or PART offers, because
the former schema cannot represent them. It never silently deletes parts.

## Alternatives

- Independent part offers and duplicated Media/favorites/conversations: simpler
  initial schema change, but two inconsistent authorization/lifecycle/history systems.
- Root nullable vehicle_id and part_id with ever-growing fields: rejected for subtype
  ambiguity, misleading DTOs and weaker ownership boundaries.
- Full generic product engine / arbitrary JSON specification: unnecessary for two
  concrete domains and loses explicit relational validation.
- Deferred triggers enforcing every root has a subtype: stronger arbitrary-SQL
  protection, but more migration/ORM operational complexity; not required for this stage.

## Consequences

One additional subtype join is needed for vehicle reads, covered by PK and vehicle
indexes. Existing discovery SQL is adapted through module-owned projections. Cars
Search was subsequently generalized by ADR 0006's subtype extension: Parts and Vehicles
now share the cursor/Geo/media orchestration with subtype-specific projections.
Seller pagination can contain both types without exposing private product/location data.
Deploy as a coordinated API/schema release: old API binaries expect root vehicle_id;
public IDs and existing client paths are preserved, DTO type is additive.
