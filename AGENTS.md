# AGENTS.md

## 1. Purpose

This repository contains a production-grade multi-category automotive marketplace intended for long-term ownership, scaling, and eventual handoff to a large corporate client.

The product currently supports at least two marketplace categories:

- `VEHICLE` — automobiles;
- `PART` — automotive parts.

The system must remain maintainable, secure, observable, testable, and evolvable without premature distributed-system complexity.

When making changes, optimize for:

1. correctness;
2. security;
3. data integrity;
4. maintainability;
5. reliability;
6. simplicity;
7. testability;
8. observability;
9. predictable performance;
10. future scalability.

Do not optimize for speed of implementation at the cost of architectural integrity.

---

## 2. Read Before Changing Code

Before modifying an unfamiliar area:

1. inspect the current implementation;
2. read the relevant documentation under `docs/`;
3. read the current entities, migrations, tests, and application contracts;
4. understand existing module ownership;
5. preserve useful working code;
6. identify existing invariants before introducing new ones.

Do not rewrite functioning subsystems merely because another implementation style is personally preferred.

Repository behavior and existing architectural decisions take precedence over speculative redesign.

---

## 3. Scope Discipline

Implement only the requested scope.

Do not silently start the next product stage.

Do not add unrelated:

- commercial features;
- frameworks;
- infrastructure;
- providers;
- abstractions;
- microservices;
- admin capabilities;
- background jobs;
- search engines;
- external integrations.

A good implementation solves the current task while keeping future work possible.

It does not pre-build every future feature.

---

## 4. Repository Structure

The repository is an npm-workspaces monorepo.

Primary structure:

```text
apps/
  api/
  web/

docs/
infra/
scripts/
.github/workflows/
```

`packages/` should be introduced only when real cross-application reuse exists.

Do not create generic dumping grounds such as:

```text
common/
shared/
utils/
helpers/
```

without a clear, cohesive responsibility.

Shared code must have a specific reason to exist.

---

## 5. Core Technology Stack

Backend:

```text
NestJS
TypeScript
PostgreSQL
PostGIS
TypeORM
Redis
BullMQ
S3-compatible object storage
```

Frontend:

```text
Next.js
React
TypeScript
App Router
MapLibre GL JS
```

Development object storage:

```text
MinIO
```

MinIO is a local/development S3-compatible implementation, not an application-level dependency.

The application must remain portable to other S3-compatible providers.

---

## 6. Architecture Style

Use a **Modular Monolith**.

Do not introduce microservices merely because a subsystem could theoretically become one later.

Current logical modules include responsibilities such as:

```text
auth
users
vehicles
parts
listings
media
geo
search
favorites
messaging
notifications / engagement
moderation
admin
audit
```

Module boundaries must remain explicit.

Future extraction of Search, Geo, Media, Messaging, Notifications, or Analytics must remain possible, but current implementation stays inside the modular monolith unless there is a concrete operational reason to split it.

---

## 7. Module Ownership

Every domain concept must have an owning module.

Avoid:

- circular module dependencies;
- cross-module persistence access without a public application contract;
- importing another module's private service implementation;
- shared mutable domain logic copied between modules.

Prefer public application contracts between modules.

Do not use `forwardRef()` as a default solution to poor boundaries.

A cycle usually indicates misplaced responsibility.

---

## 8. Keep Controllers Thin

Controllers are transport adapters.

They should handle:

- DTO validation;
- authentication/authorization decorators;
- HTTP headers;
- response mapping;
- status codes.

Controllers must not contain large amounts of business logic.

Business rules belong in application/domain services.

Persistence-specific TypeORM logic belongs near persistence code.

---

## 9. Avoid Giant Services

Do not create thousand-line services that handle unrelated responsibilities.

Split services by cohesive use case or business capability.

At the same time, do not fragment code into dozens of one-method abstractions without value.

Prefer cohesion over file count.

---

## 10. Do Not Dogmatically Apply Clean Architecture

Use separation where it provides value.

Do not create excessive interfaces, factories, adapters, repositories, commands, handlers, and mapping layers merely to imitate a textbook architecture.

A modular monolith with clear application boundaries is sufficient.

---

# Marketplace Architecture

## 11. Marketplace Is Multi-Category

The marketplace is no longer vehicle-only.

At minimum:

```text
ListingType.VEHICLE
ListingType.PART
```

All future work must respect this.

Do not reintroduce assumptions that every `Listing` directly represents a vehicle.

---

## 12. Listing Is the Marketplace Root

`Listing` is the shared marketplace offer/root identity.

Common concerns belong to `Listing`, including:

```text
id
sellerId
type
title
description
price
currency
status
version
submittedAt
publishedAt
soldAt
archivedAt
createdAt
updatedAt
```

and other genuinely common lifecycle fields.

`Listing.id` is the public identity of the marketplace offer.

---

## 13. Explicit Listing Subtypes

Category-specific data belongs to explicit subtype structures.

Current model:

```text
Listing
 ├─ VehicleListing -> Vehicle
 └─ PartListing    -> Part
```

Persistence uses subtype tables such as:

```text
vehicle_listings
part_listings
```

Do not move product-specific attributes back into the root `listings` table merely for query convenience.

---

## 14. No Parallel Marketplace Architecture

Do not create category-specific copies of shared marketplace capabilities when they can operate on the common Listing identity.

In particular, avoid introducing:

```text
part_media
part_favorites
part_messages
part_reports
part_audit_logs
part_locations
```

Shared capabilities should continue to reference `Listing.id`.

Prefer explicit Listing subtypes over parallel marketplace architectures.

---

## 15. Shared Marketplace Capabilities

The following capabilities are shared across Cars and Parts:

```text
Listing lifecycle
seller ownership
optimistic concurrency
Media
Location
Favorites
Conversations
Reports
Moderation
Audit
Notifications
Search infrastructure
Geo infrastructure
Map infrastructure
```

Product-specific validation may differ.

The underlying shared capability should not be duplicated.

---

## 16. Listing Type Integrity

A `Listing` discriminator and subtype must remain consistent.

Examples of invalid states:

```text
Listing.type = VEHICLE
but only a PartListing subtype exists
```

or:

```text
one Listing simultaneously has VehicleListing and PartListing
```

Application transactions and database constraints must enforce subtype integrity as strongly as practical.

Do not depend solely on frontend behavior.

---

# Vehicle Domain

## 17. Vehicle and Listing Are Different Concepts

`Vehicle` describes an automobile observation/specification.

`Listing` describes an offer to sell.

Do not merge them.

Seller ownership belongs to `Listing`, not to `Vehicle`.

Do not introduce `Vehicle.ownerId` as legal ownership semantics.

---

## 18. Vehicle Catalog

Managed vehicle catalog concepts remain separate:

```text
VehicleMake
VehicleModel
VehicleGeneration
```

Typical relation:

```text
Make -> Models -> Generations
```

A `Vehicle` references its model.

Avoid redundant `makeId` on Vehicle if model already determines make.

---

## 19. Vehicle Observation Copy-on-Write

Vehicle data used by historical or other Listings must not be silently mutated.

When seller edits vehicle characteristics for an editable Listing and the current architecture requires preserving other observations, use copy-on-write.

Editing one Listing must not unexpectedly change another Listing's Vehicle data.

---

## 20. Vehicle Sensitive Data

VIN is sensitive/private marketplace data.

It must not be returned in ordinary public DTOs.

VIN must not be blindly globally unique because the same physical vehicle may appear in multiple historical sales/listings.

Normalize and validate VIN through the existing domain policy.

---

# Parts Domain

## 21. Parts Is a First-Class Domain

`parts` is a dedicated domain/module.

It owns concepts including:

```text
Part
PartCategory
PartBrand
PartFitment
part-specific validation
part-number normalization
compatibility rules
```

Do not implement Parts as another Vehicle subtype.

---

## 22. Part Categories

Part categories are database-backed reference data.

They support hierarchy through the existing adjacency model.

Do not replace categories with a hard-coded enum.

The taxonomy must remain extensible.

Prevent obvious hierarchy cycles.

---

## 23. VehicleMake and PartBrand Are Different

Do not conflate:

```text
VehicleMake
```

with:

```text
PartBrand
```

Examples such as Bosch, Brembo, Valeo, Sachs, or MANN-FILTER are part manufacturers/brands, not vehicle makes.

---

## 24. Part Numbers

Parts support distinct concepts such as:

```text
OEM number
manufacturer part number
```

Use the existing canonical normalization function.

Do not implement a second normalization policy in Search or another module.

Do not apply global uniqueness to OEM/manufacturer numbers unless a future verified catalog explicitly requires it.

Multiple sellers and alternative products may legitimately share a number.

---

## 25. Part Quantity

`quantityAvailable` is specific to Part offers.

Do not move quantity into the root Listing merely because Parts currently use it.

The existing bounded quantity constraints must remain enforced.

Price is per unit under the current model.

---

## 26. Part Compatibility

Compatibility supports:

```text
UNIVERSAL
VEHICLE_SPECIFIC
```

Do not create fake catalog records such as:

```text
ALL CARS
```

for universal parts.

---

## 27. Vehicle-Specific Fitment

Vehicle-specific fitments support:

```text
VehicleModel
optional VehicleGeneration
optional yearFrom
optional yearTo
```

A Part may have multiple fitments.

When generation is specified, it must belong to the specified model.

Year ranges must be valid.

Nullable generation/year semantics must remain consistent with documented Parts behavior.

---

## 28. Compatibility Is Seller-Declared

Unless a future external verified catalog is introduced, fitment compatibility is seller-provided information.

UI/API wording must not falsely represent it as externally certified compatibility.

---

## 29. Avoid Duplicate Fitments

Database/application rules must prevent duplicate compatibility scopes, including nullable generation/year combinations.

Preserve current `NULLS NOT DISTINCT`/equivalent semantics where used.

---

# Listing Lifecycle

## 30. One Shared Lifecycle

Cars and Parts use the same Listing lifecycle.

Core states include:

```text
DRAFT
PENDING_MODERATION
REJECTED
PUBLISHED
SOLD
ARCHIVED
```

Do not create a separate Part listing lifecycle.

---

## 31. Seller State Transitions

Current seller-facing transitions include concepts such as:

```text
DRAFT -> PENDING_MODERATION
REJECTED -> PENDING_MODERATION

PUBLISHED -> SOLD

supported states -> ARCHIVED
```

Use the existing centralized lifecycle implementation.

Do not spread transition rules across controllers.

---

## 32. Moderator Transitions

Moderation controls:

```text
PENDING_MODERATION -> PUBLISHED
PENDING_MODERATION -> REJECTED
```

Moderator removal of a published Listing currently uses:

```text
PUBLISHED -> ARCHIVED
```

with an immutable moderation action recording that the archive was a moderation removal.

Do not make moderator removal indistinguishable from seller intent in audit/history.

---

## 33. Editing Policy

Current editing policy:

```text
DRAFT
REJECTED
```

are seller-editable.

Do not silently make `PUBLISHED` editable.

Published edits require an explicit revision/re-moderation design.

---

## 34. Product-Specific Submission Validation

The lifecycle engine is shared.

Submission completeness may be subtype-specific.

Vehicle submission may require:

- Vehicle data;
- required location;
- READY primary media.

Part submission may require:

- category;
- part specification;
- quantity;
- compatibility/universal declaration;
- READY primary media.

Do not duplicate the lifecycle implementation to support subtype-specific completeness rules.

---

## 35. Published Invariants

Before moderation approval, publication invariants must be checked again.

Do not rely solely on validation performed when seller submitted the Listing.

Legacy/corrupted data must not be published merely because the status is `PENDING_MODERATION`.

---

# Ownership and Concurrency

## 36. Seller Identity Comes From Principal

Never accept authoritative `sellerId` from browser input.

Seller is derived from the authenticated principal.

---

## 37. IDOR Protection

Every private seller operation must verify ownership on the backend.

For private resources, non-owner access generally returns `404` where existence should not be disclosed.

Frontend hiding is not authorization.

---

## 38. ADMIN Does Not Automatically Bypass Ownership

Do not make `ADMIN` a universal ownership bypass.

Administrative access must use explicit admin/moderation APIs and policies.

This avoids accidental privilege escalation through seller APIs.

---

## 39. Optimistic Concurrency

Listing edits and lifecycle mutations use the existing atomic version CAS.

Use the existing HTTP concurrency contract, including `If-Match` where applicable.

Stale mutations must fail with a stable conflict error.

Never silently overwrite a concurrent change.

---

## 40. Lifecycle Commands Need CAS Too

Concurrency protection applies not only to PATCH.

Commands such as:

```text
submit
archive
mark-sold
approve
reject
remove
```

must remain concurrency-safe.

---

## 41. Transactions

Use transactions when an operation changes multiple records that form one business action.

Examples:

- Listing + subtype + location + audit;
- Listing edit + subtype changes + fitments;
- state transition + audit + notification + outbox;
- moderation resolution;
- refresh token rotation.

Keep transactions as short as practical.

Do not perform slow external network calls while holding database locks.

---

# Authentication and Authorization

## 42. Browser Authentication Strategy

Current browser auth architecture:

- short-lived access JWT;
- access token stored only in browser memory;
- refresh credential in HttpOnly cookie;
- refresh rotation;
- reuse detection;
- multi-device logical sessions.

Do not move access tokens into:

```text
localStorage
sessionStorage
IndexedDB
```

without an explicit architectural decision.

---

## 43. Token Lifetimes

Current defaults are approximately:

```text
access: 10 minutes
session absolute lifetime: 30 days
session idle lifetime: 7 days
```

Configuration remains authoritative.

Do not hard-code values throughout the application.

---

## 44. Refresh Credentials

Raw refresh credentials must never be persisted.

Only safe digests belong in the database.

Refresh rotation and reuse detection must remain transactional and concurrency-safe.

---

## 45. Session Family

`UserSession` is the logical browser/device session.

Refreshing does not create a new logical session.

New refresh token records remain part of the same session/token family.

---

## 46. Roles

Fixed roles currently include:

```text
USER
MODERATOR
ADMIN
```

A user may have multiple roles.

`USER` is the base role.

`MODERATOR` and `ADMIN` are additional privileges.

Do not introduce arbitrary dynamic roles without a real product requirement.

---

## 47. Persisted Security State

Protected requests use current persisted security state according to the existing auth implementation.

Blocking, suspension, session revocation, and role changes must not rely indefinitely on stale JWT claims.

---

## 48. Centralized Authorization

Use existing guards/decorators/policies.

Do not scatter:

```ts
if (user.roles.includes('ADMIN'))
```

through controllers.

---

## 49. Account Status

Respect current account statuses such as:

```text
ACTIVE
PENDING_VERIFICATION
SUSPENDED
BLOCKED
```

Suspended/blocked users must not regain access through refresh or stale application assumptions.

---

## 50. Last Admin Protection

Do not allow administrative actions that remove the final active ADMIN or accidentally lock the system out.

Preserve self-protection and last-admin invariants.

---

# PostgreSQL and TypeORM

## 51. PostgreSQL Is the Source of Truth

Authoritative business state belongs in PostgreSQL.

Redis is not the source of truth for:

- listings;
- sessions;
- messages;
- notifications;
- favorites;
- search subscriptions;
- moderation state.

---

## 52. Schema Changes Only Through Migrations

Never enable:

```text
synchronize: true
```

Schema modifications require explicit TypeORM migrations.

Do not modify already-applied historical migrations to implement new behavior.

Create a new migration.

---

## 53. PostGIS Extensions

Do not silently install PostgreSQL extensions during ordinary application startup.

Infrastructure/migrations control PostGIS availability according to current project conventions.

---

## 54. Reversible Migrations

Migrations should have a meaningful `down()` where practical.

However, do not pretend that a destructive production rollback is safe when new domain data cannot be represented by the old schema.

Document rollback limitations honestly.

---

## 55. Migration Verification

For schema changes, verify as applicable:

```text
clean apply
rollback
reapply
no pending migrations
ORM schema consistency
```

Do not report migration success without running the relevant command.

---

## 56. Database Naming

Use:

```text
snake_case
```

in PostgreSQL and:

```text
camelCase
```

in TypeScript according to current conventions.

---

## 57. Public Identifiers

Use UUIDs for externally exposed entity identifiers.

Do not expose sequential internal identifiers as public IDs.

---

## 58. Time

Use UTC.

PostgreSQL timestamp semantics should use `timestamptz` where appropriate.

Do not store local wall-clock times as business truth.

---

## 59. Money

Never use binary floating point for money.

Use the existing minor-unit integer representation and explicit currency.

Do not compare values from different currencies as though they were equivalent.

Do not silently convert currencies without an explicit exchange-rate subsystem.

---

## 60. Constraints Are Valuable

Use database constraints for durable invariants where appropriate:

- foreign keys;
- unique constraints;
- check constraints;
- partial unique indexes;
- subtype integrity;
- valid quantity/ranges;
- primary media uniqueness.

Application validation improves errors.

Database constraints remain the final integrity boundary.

---

## 61. Deletion Behavior

Choose `ON DELETE` behavior deliberately.

Do not use blanket cascading deletes.

Security/audit/moderation history must not disappear because a business entity is removed.

---

## 62. Soft Delete Is Not a Default

Use lifecycle/archive states where they model business semantics.

Do not add `deletedAt` to every table automatically.

---

# API Design

## 63. API Prefix

REST API is versioned under:

```text
/api/v1
```

Preserve this convention.

---

## 64. OpenAPI

Public/backend HTTP contracts must remain documented in Swagger/OpenAPI.

When changing an endpoint:

- update request schemas;
- update response schemas;
- update errors;
- update security requirements;
- update discriminators where applicable.

---

## 65. DTOs, Not Entities

Never return ORM entities directly.

Use explicit allowlisted DTOs.

This is especially important for:

- User;
- Listing;
- Vehicle;
- Part;
- Session;
- Media;
- Notification;
- Moderation;
- Audit.

---

## 66. Discriminated Marketplace DTOs

For Cars and Parts, prefer discriminated unions.

Conceptually:

```ts
type PublicListing =
  | PublicVehicleListing
  | PublicPartListing;
```

Avoid giant DTOs with dozens of nullable fields where half are meaningless for each subtype.

---

## 67. Input Allowlisting

Do not accept arbitrary entity-shaped PATCH bodies.

DTOs must expose only fields a user is allowed to change.

Protect against mass assignment.

System fields must not be client-mutable.

---

## 68. Errors

Use stable machine-readable application error codes.

Do not leak:

- SQL errors;
- stack traces;
- storage provider internals;
- secret configuration.

Map infrastructure failures to safe API errors.

---

## 69. Pagination

Every potentially large collection endpoint must be bounded.

Public marketplace search uses keyset/cursor pagination.

Do not introduce unbounded array responses.

Avoid exact totals where they are not necessary.

---

# Media

## 70. Shared Media Pipeline

Media belongs to the common Listing identity and works for both VEHICLE and PART.

Do not create category-specific media pipelines.

---

## 71. Upload Architecture

Current flow is:

```text
initialize
→ presigned PUT
→ direct S3 upload
→ complete / HEAD
→ asynchronous processing
→ READY
```

Large source uploads should not flow through NestJS unless explicitly required.

---

## 72. Media Security

Do not trust:

- extension;
- browser MIME type;
- client-declared dimensions;
- client-declared size.

Validate the real object.

Current image processing uses safe decoding/re-encoding and strips EXIF/GPS from public variants.

---

## 73. Public Media

Only processed `READY` variants are public.

Do not expose raw source objects.

Do not expose storage keys or credentials in public DTOs.

---

## 74. Media Immutability

Seller media mutation is allowed only in existing editable Listing states.

`PENDING_MODERATION` and `PUBLISHED` content remains immutable under current policy.

Do not bypass moderation consistency.

---

## 75. Primary Image

Maintain the invariant:

```text
at most one READY primary media per Listing
```

Preserve the database constraint and transaction-safe behavior.

---

## 76. Background Processing

Media uses Redis/BullMQ workers with persisted database recovery state.

Assume at-least-once execution.

Worker logic must remain idempotent.

---

# Geo

## 77. SRID

Canonical stored geographic points use:

```text
SRID 4326
```

Do not migrate canonical location storage to Web Mercator merely because the map uses it for rendering/clustering.

---

## 78. Exact vs Public Location

This is a strict privacy boundary.

```text
exactPoint
```

is private/internal.

```text
publicPoint
```

is the coordinate allowed for public display.

Never implement:

```ts
publicPoint ?? exactPoint
```

---

## 79. Exact Point Uses

The backend may use exactPoint internally for:

- radius filtering;
- nearest ranking;
- internal membership checks.

This does not make it public.

---

## 80. Public Map Uses

Markers and map clustering use only:

```text
publicPoint
```

Listings without `publicPoint` remain searchable in ordinary list results when otherwise eligible, but must not appear as map markers.

---

## 81. Distance Privacy

Do not return unnecessarily precise distances derived from private coordinates.

Preserve the existing rounded-distance policy.

Do not claim rounding fully prevents triangulation.

---

# Search

## 82. Unified Search Infrastructure

There is one marketplace Search infrastructure.

Do not create a separate full search engine for Cars and Parts.

Use:

```text
common orchestration
+ Vehicle-specific filters
+ Part-specific filters
```

---

## 83. Canonical Search Endpoint

The current canonical public search endpoint is:

```text
GET /api/v1/listings
```

New clients should explicitly use:

```text
type=VEHICLE
```

or:

```text
type=PART
```

Historical missing-type behavior exists only for backward compatibility.

Do not build new clients that depend on implicit type.

---

## 84. Product-Specific Filters

Vehicle filters include existing concepts such as:

```text
make
model
generation
year
price
mileage
body type
fuel
transmission
drive
condition
color
```

Part filters include concepts such as:

```text
category
brand
condition
OEM number
manufacturer part number
compatibility
price
```

Reject filters that do not apply to the selected Listing type.

Do not silently ignore cross-type filters.

---

## 85. Part Search Compatibility

Parts Search must preserve the same fitment semantics as Parts domain:

- make/model/generation integrity;
- optional year;
- universal inclusion policy;
- category subtree policy;
- canonical part-number normalization.

Do not duplicate these rules with divergent logic.

---

## 86. Search Cursor

Current public Search cursor is opaque, encrypted/authenticated, versioned, expiring, and bound to a canonical query fingerprint.

Preserve the existing implementation.

A cursor from one:

```text
type
filters
sort
geo context
```

must not be accepted for another.

---

## 87. Search Source of Truth

Search currently uses PostgreSQL/PostGIS.

Do not add:

```text
OpenSearch
Elasticsearch
Algolia
Meilisearch
Typesense
```

without measured need.

Possible future triggers include:

- complex free text;
- typo tolerance;
- advanced ranking;
- very heavy faceting;
- substantially higher search QPS.

---

## 88. Search Query Safety

All filters use bound parameters.

Sorts must use allowlists.

Never interpolate user-provided SQL identifiers/fragments directly.

---

## 89. Search Performance

Avoid:

- N+1;
- default `COUNT(*)`;
- offset pagination for canonical marketplace search;
- loading full entity graphs.

Use targeted projections.

Validate new indexes through realistic `EXPLAIN (ANALYZE, BUFFERS)` workflows.

---

## 90. Search Index Discipline

Do not create an index for every filter column.

Consider:

- selectivity;
- partial `PUBLISHED` indexes;
- actual query plans;
- write/storage cost;
- overlapping indexes.

Add indexes because measured query plans justify them.

---

# Map

## 91. Shared Map Infrastructure

Cars and Parts use the same Map infrastructure.

Do not create separate complete:

```text
CarMap
PartMap
```

implementations.

Subtype-specific marker presentation may differ.

---

## 92. MapLibre

Frontend map uses MapLibre GL JS.

Map provider/style configuration must remain external/configurable.

Do not leak server secrets to the browser.

Preserve provider attribution requirements.

---

## 93. Map Is a Search Projection

Map filters use the same canonical Search semantics.

Do not let list and map implement different business filtering rules.

---

## 94. Viewport Is Not Search BBox

Keep separate concepts:

```text
map viewport
```

versus:

```text
actual Search bbox filter
```

A user panning the map does not automatically redefine their global Search.

`Search this area` is an explicit action.

---

## 95. Server-Assisted Clustering

Do not cluster only a truncated first page of marker points on the client.

Server-assisted clustering must operate on the full set of matching public display points within the viewport, subject to bounded response rules.

---

## 96. Clustering Privacy

Cluster:

- centers;
- counts;
- bounds;

must be based exclusively on `publicPoint`.

Never use `exactPoint` for display clustering.

---

## 97. Map Feature Types

Map API uses discriminated features such as:

```text
LISTING
CLUSTER
```

Clusters are derived data.

Do not persist a `map_clusters` table.

---

## 98. Map Response Bounds

Map responses remain bounded.

At low zoom, aggregate with clusters.

At high zoom, return individual markers as practical.

If even the aggregated result exceeds the response bound, return explicit truncation metadata.

---

## 99. Map Frontend Performance

Prefer MapLibre data sources/layers over hundreds of React DOM markers.

Reuse a single map instance.

Update source data rather than reconstructing the map on each request.

Cancel stale viewport requests.

---

# Moderation and Admin

## 100. Role Separation

`MODERATOR` handles content moderation.

`ADMIN` additionally handles administrative account/role/audit operations.

Do not give MODERATOR implicit ADMIN capabilities.

---

## 101. Moderation Queue

Cars and Parts share one moderation workflow.

Moderation decisions must respect Listing type and subtype-specific publication invariants.

---

## 102. Approval

Approval must:

- require `PENDING_MODERATION`;
- use version/CAS;
- revalidate publication invariants;
- atomically update Listing;
- create moderation history;
- create audit;
- create seller notification.

---

## 103. Rejection

Use structured reason codes.

Seller-visible moderation messages and internal moderator notes are separate concerns.

Never expose internal notes or moderator identity through seller/public DTOs.

---

## 104. Reports

Reports may target existing supported types such as:

```text
LISTING
USER
MESSAGE
```

Keep target access and report context bounded.

Private message moderation context must not expand into unrestricted conversation surveillance.

---

## 105. User Administration

ADMIN account operations include controlled:

```text
suspend
block
reactivate
role changes
```

Status changes that disable the user revoke existing sessions.

Reactivation never restores old sessions.

---

## 106. Admin Audit

Audit remains append-only.

Do not create mutation/delete APIs for AuditLog.

Privileged audit queries still use safe allowlisted DTOs.

---

# Favorites, Saved Searches, Notifications, Outbox

## 107. Favorites Are Shared

Favorites reference common `Listing.id`.

Do not create category-specific favorite tables.

Cars and Parts use the same Favorites subsystem.

---

## 108. Favorite Privacy

If a previously favorited Listing becomes unavailable/private:

do not expose its former private data.

Return a safe unavailable/tombstone representation.

---

## 109. Saved Searches Reuse Canonical Search

Saved Searches must use the same canonical Search model and normalization rules as public Search.

Do not create another interpretation of Vehicle/Part filters.

---

## 110. Saved Search Versioning

Saved Search filters are schema-versioned.

Unknown schema versions must not be executed silently.

---

## 111. Saved Search Location Privacy

Precise browser Near Me origin:

```text
lat
lng
radius
```

must not be persisted as a Saved Search.

An explicit coarse/search bbox may be persisted under current policy.

Map viewport is not automatically a saved filter.

---

## 112. Saved Search Fingerprints

Canonical-equivalent filter sets must produce deterministic fingerprints.

Do not allow trivial duplicates because array order or query-param order differs.

---

## 113. Transactional Outbox

Durable asynchronous domain events use PostgreSQL transactional outbox.

Business transaction and relevant outbox event must commit atomically.

Do not use Redis/BullMQ as the sole durability layer for domain events.

---

## 114. Outbox Semantics

Assume at-least-once processing.

Consumers must be idempotent.

Use:

- bounded claims;
- leases;
- retry/backoff;
- stale lease recovery;
- terminal failure state;
- deduplication.

---

## 115. Domain Events

Current relevant Listing events include concepts such as:

```text
LISTING_PUBLISHED
LISTING_MARKED_SOLD
LISTING_ARCHIVED
LISTING_REMOVED_BY_MODERATOR
```

New event types should describe business facts, not transport instructions.

---

## 116. Notification vs Domain Event

A domain event is not automatically a Notification.

Example:

```text
LISTING_PUBLISHED
```

may generate:

```text
SAVED_SEARCH_MATCH
```

for several users.

Keep event, notification, and delivery concepts separate.

---

## 117. Direct Notifications vs Outbox

A single-recipient Notification created in the same PostgreSQL transaction as a moderation/account action is already durable.

Do not force every such notification through the outbox merely for conceptual uniformity.

Use outbox primarily where asynchronous fan-out or cross-module processing is required.

---

## 118. Notification Payloads

Notification payloads are versioned and type-specific.

Never treat arbitrary JSON as trusted notification UI data.

Frontend uses type-specific presenters.

Unknown future/legacy types must degrade safely.

---

## 119. Notification Deep Links

Do not store attacker-controlled arbitrary URLs.

Build internal routes from trusted type/target identifiers.

Protect against open redirects.

---

## 120. Saved Search Matching

Saved Search matching semantics must remain in parity with public Search.

Reuse domain/search predicates instead of copying them.

Especially preserve:

- Vehicle filters;
- Part category subtree;
- part-number normalization;
- fitment compatibility;
- universal parts;
- price/currency;
- bbox semantics.

---

# Messaging Readiness

## 121. Reuse Existing Messaging Persistence

Messaging persistence already uses concepts such as:

```text
Conversation
ConversationParticipant
Message
```

Future Messaging API/realtime work must reuse them.

Do not create parallel `chat_*` persistence unless the current model is objectively insufficient.

---

## 122. Conversation Is Listing-Scoped

Marketplace conversations are associated with common `Listing.id`.

Therefore the same messaging subsystem must support both Cars and Parts.

Do not create Part-specific conversations/messages.

---

## 123. Participant Integrity

Preserve database/application membership rules.

A sender must be a participant in the conversation.

Do not rely only on frontend conversation IDs.

---

## 124. Message Privacy

Message bodies are private user content.

Do not write message bodies to:

- ordinary logs;
- audit metadata;
- outbox payloads unless absolutely necessary.

Moderator message-context access remains explicitly privileged and bounded.

---

## 125. Realtime Is Transport, Not Truth

Future WebSocket realtime transport must never replace PostgreSQL persistence.

Message/Notification state must recover after:

- reload;
- reconnect;
- missed socket event;
- Redis outage.

---

# Redis and Background Work

## 126. Redis Is Not Authoritative

Redis may support:

- rate limiting;
- queues;
- pub/sub;
- ephemeral coordination;
- cache.

If Redis loses data, authoritative marketplace data must remain intact.

---

## 127. Background Jobs Are At-Least-Once

Assume a job may run multiple times.

Workers must be idempotent.

Do not design a worker assuming exactly-once delivery.

---

## 128. Job Payloads

Keep queue/outbox payloads minimal.

Prefer IDs.

Do not enqueue:

- raw media;
- passwords;
- access/refresh tokens;
- private coordinates;
- entire ORM entities.

---

## 129. Worker Shutdown

Workers must support graceful shutdown.

Stop claiming new work and allow bounded active work to complete when practical.

---

## 130. Separate Process Readiness

Workers may live in the same repository/module system but should be runnable as independent processes/containers.

Do not prematurely turn them into microservices.

---

# Security

## 131. Security Is a Backend Responsibility

Never rely on frontend hiding, disabled buttons, or route visibility for authorization.

Backend enforcement is mandatory.

---

## 132. Threats to Consider

At minimum evaluate:

- IDOR;
- mass assignment;
- SQL injection;
- XSS;
- CSRF;
- SSRF;
- unsafe redirects;
- file upload attacks;
- decompression bombs;
- rate-limit abuse;
- cursor tampering;
- privilege escalation;
- stale concurrency writes;
- private-location leakage;
- secret leakage.

---

## 133. SQL

Always use parameter binding.

Sort/order selections use allowlists.

Never inject raw user input into SQL fragments.

---

## 134. XSS

User text is plain text unless explicitly designed otherwise.

Do not treat:

- Listing title;
- description;
- messages;
- moderation notes;
- report details;

as trusted HTML.

Avoid unsafe `innerHTML`.

---

## 135. CSRF

Cookie-authenticated security endpoints follow the existing Origin/SameSite policy.

Do not weaken it casually.

Bearer-token protected application requests have a different threat model.

---

## 136. Secrets

Never commit secrets.

`.env.example` contains placeholders or safe development defaults only.

Production startup should reject invalid/weak critical secret configuration where the existing config model requires it.

---

## 137. Logging Secrets

Never log:

- password;
- password hash;
- raw refresh token;
- access token;
- reset/verification token;
- cookie;
- Authorization header;
- presigned upload URL;
- S3 credentials.

---

## 138. Geographic Privacy

Do not log exact browser geolocation in ordinary info logs.

Do not expose exact Listing coordinates through public APIs.

Do not weaken `exactPoint`/`publicPoint` boundaries.

---

## 139. Private Resource Enumeration

For private seller/user resources, prefer non-disclosing not-found semantics where current project policy uses them.

---

## 140. Rate Limiting

Use endpoint-appropriate rate limits.

Authentication, Search, Geo, uploads, Reports, engagement mutations, and future messaging have different abuse profiles.

Do not apply one global threshold to everything.

---

# Frontend

## 141. Next.js App Router

Follow existing App Router conventions.

Do not introduce a second frontend architecture.

---

## 142. API Access

Use existing typed API/client infrastructure.

Do not scatter raw `fetch()` calls throughout components when an established client layer exists.

---

## 143. URL-Backed Search State

Cars and Parts search filters remain reproducible through URL state.

Preserve:

- reload;
- sharing;
- back/forward;
- deterministic parsing.

---

## 144. Cars and Parts Are Separate User Sections

Primary navigation treats:

```text
/cars
/parts
```

as separate marketplace sections.

Do not hide Parts inside a Cars filter.

---

## 145. Seller Workspace Is Shared

Seller account management remains common.

For example:

```text
/account/listings
```

contains both Vehicle and Part listings.

Use type filters/badges instead of creating completely separate seller dashboards.

---

## 146. Sell Entry

The sell flow distinguishes:

```text
/sell/car
/sell/part
```

through a shared type chooser.

Shared UI components should remain reusable where domain semantics match.

---

## 147. Shared Components

Reuse generic components for concerns such as:

- money;
- Listing Media;
- location;
- lifecycle actions;
- optimistic conflict handling.

Do not make a component generic when the semantics genuinely differ.

---

## 148. Async UX States

Every async screen/action must deliberately handle:

```text
loading
success
empty
error
```

and relevant conflict/retry states.

Do not leave the UI blank during meaningful network state.

---

## 149. Request Races

Search/map/filter requests must cancel or ignore stale responses.

An older slow response must not overwrite newer state.

---

## 150. Accessibility

Use semantic HTML and accessible controls.

Important flows must remain usable through keyboard navigation.

Map is supplemental; List remains an accessible alternative.

---

## 151. Responsive UX

Desktop and mobile are first-class.

Do not create desktop-only administrative/search/seller workflows.

---

# Observability

## 152. Structured Logging

Use structured JSON logs.

Include useful identifiers such as:

- request ID;
- safe entity IDs;
- operation/event type;
- duration;
- attempt count.

Do not dump arbitrary request payloads.

---

## 153. Request IDs

Preserve request/correlation ID infrastructure.

Pass causation/correlation context to async work where useful without fabricating HTTP request IDs that no longer exist.

---

## 154. Health and Readiness

Preserve health/readiness endpoints.

Readiness should reflect dependencies according to current project semantics.

Do not mark the entire application unavailable merely because a non-authoritative realtime feature is degraded unless that dependency is required for the requested operation.

---

## 155. Metrics Cardinality

If adding metrics, avoid high-cardinality labels such as:

```text
userId
listingId
mediaId
search query
coordinates
```

---

## 156. Slow Queries

For expensive subsystems, retain structured slow-query observability.

Log query type/duration, not private values.

---

# Testing

## 157. Tests Are Required

Changes should include meaningful tests appropriate to risk.

Possible levels:

```text
unit
HTTP/controller
integration
frontend/component
browser E2E
```

Do not add tests that merely mirror implementation without protecting behavior.

---

## 158. Real Infrastructure Integration Tests

Database/infrastructure behavior must be tested against real services where necessary:

```text
PostgreSQL/PostGIS
Redis
MinIO
BullMQ workers
```

Do not replace critical persistence/geo/storage integration tests with mocks.

---

## 159. Deterministic Test Data

Tests and performance fixtures must be deterministic.

Do not depend on random external state.

---

## 160. Concurrency Tests

Concurrency-sensitive behavior requires explicit tests.

Examples:

- CAS;
- refresh rotation;
- media limits;
- primary media;
- moderation decisions;
- Part inventory;
- Saved Search limits;
- outbox claims.

Do not assume transaction code is correct without race tests.

---

## 161. Security Regression Tests

Where practical, maintain coverage for:

- IDOR;
- mass assignment;
- sensitive DTO leakage;
- stale version;
- cursor tampering;
- exact-location privacy;
- privilege escalation;
- token/session behavior.

---

## 162. Query-Plan Tests

Performance-sensitive database work should use realistic-enough datasets and:

```text
EXPLAIN (ANALYZE, BUFFERS)
```

Do not draw index conclusions from tables containing ten rows.

---

## 163. Development Benchmark Disclaimer

Local SQL timings are development measurements.

Do not present them as production SLA guarantees.

---

## 164. Browser Testing

Playwright/browser infrastructure is not currently guaranteed.

When unavailable:

- do not claim browser E2E PASS;
- cover behavior with frontend tests;
- provide manual QA checklists for visual/realtime/map flows.

---

# Performance

## 165. Avoid N+1

Collection/detail queries must be reviewed for N+1 behavior.

Do not load full ORM relation graphs for convenience.

Use projections/batch queries.

---

## 166. Bounded Work

Every externally triggerable operation should be bounded.

Examples:

- page sizes;
- map features;
- radius;
- multi-select filters;
- fitments;
- media count;
- Saved Searches;
- outbox batches.

---

## 167. Cache Carefully

Do not cache high-cardinality Search/Geo responses merely because Redis exists.

Every cache requires an invalidation/correctness story.

No cache is better than an incorrect cache.

---

## 168. Statement Timeouts

Respect current PostgreSQL/query timeout policies.

Do not solve slow queries solely by increasing timeout.

Investigate the plan first.

---

## 169. No Premature Denormalization

Do not add fields such as:

```text
listing.make_name
listing.part_category_name
```

merely to avoid joins.

Denormalize only with measured justification and an update-consistency design.

---

# Infrastructure and Operations

## 170. Local Infrastructure

Development/test infrastructure uses Docker Compose according to repository conventions.

PostgreSQL/PostGIS, Redis, and MinIO should have:

- health checks;
- persistent volumes where intended;
- isolated test configuration.

---

## 171. Production Statelessness

Application HTTP instances should remain stateless apart from external persistence/services.

Do not depend on process memory for durable business state.

---

## 172. S3 Compatibility

Storage logic must depend on S3-compatible contracts, not MinIO-only behavior.

---

## 173. Deployment Readiness

New subsystems should remain container/deployment-friendly.

Do not hard-code local hostnames or Windows paths.

---

## 174. Graceful Shutdown

API and workers should close:

- HTTP listeners;
- queues/workers;
- Redis connections;
- database resources;

according to existing lifecycle conventions.

---

# Documentation

## 175. Documentation Is Part of the Change

Significant architecture or domain behavior must be reflected in `docs/`.

Keep existing docs aligned with implementation.

---

## 176. Current Important Documents

Relevant documents include areas such as:

```text
architecture.md
data-model.md
authentication.md
listings.md
parts.md
media.md
search-and-geo.md
map.md
moderation-and-admin.md
favorites-saved-searches-notifications.md
```

and applicable ADRs.

When behavior changes, update the relevant existing document rather than creating conflicting documentation.

---

## 177. ADRs

Use ADRs for significant architectural decisions.

Do not create an ADR for ordinary implementation details.

An ADR should explain:

- decision;
- context;
- alternatives/trade-offs;
- consequences.

---

## 178. Comments

Comments should explain **why**, constraints, edge cases, or non-obvious behavior.

Do not narrate trivial code.

---

## 179. TODOs

Avoid vague TODOs.

A TODO should identify a concrete deferred requirement or limitation.

Do not leave TODOs that hide unfinished correctness work required by the current task.

---

# Dependency Discipline

## 180. Add Dependencies Deliberately

Before adding a dependency, evaluate:

- whether the repository already has equivalent capability;
- maintenance;
- security;
- runtime cost;
- bundle impact;
- native build requirements.

Do not add libraries for trivial functionality.

---

## 181. Lockfile

Keep the lockfile consistent with package manifests.

Do not hand-edit dependency state inconsistently.

---

## 182. Security Audit

Dependency audit results should be checked where repository workflows require them.

Do not blindly update major dependencies unrelated to the requested task.

---

# Coding Standards

## 183. TypeScript

Use strict TypeScript.

Avoid unsafe `any`.

If external data is `unknown`, validate/narrow it.

---

## 184. Enums and Domain Types

Use existing domain types rather than duplicating strings across modules.

Do not introduce a second enum that represents the same canonical business concept.

---

## 185. Immutability and Side Effects

Make side effects explicit.

Do not hide:

- DB mutation;
- queue publish;
- storage deletion;
- notification fan-out;

inside innocent-looking mapping/helpers.

---

## 186. Error Handling

Handle expected business failures explicitly.

Do not catch every error and return generic success.

Unexpected errors should propagate to centralized error handling after appropriate safe logging.

---

# Git and Change Discipline

## 187. Preserve Existing Work

Do not remove unrelated functionality while implementing a task.

Do not rewrite large working areas without necessity.

---

## 188. Generated Artifacts

Do not commit local runtime artifacts, secrets, large temporary performance databases, or generated reports unless repository policy explicitly requires them.

---

## 189. Migrations and History

Never rewrite migration history simply to make the current schema look cleaner.

Production systems evolve through new migrations.

---

# Verification

## 190. Required Verification

For substantial changes, run the relevant available commands.

Core quality checks generally include:

```text
npm run lint
npm run typecheck
npm test
npm run build
```

Database/integration work should also use the repository's real infrastructure workflow.

---

## 191. Integration Verification

Where applicable:

```text
npm run infra:test:up
npm run migration:run
npm run test:integration
npm run infra:test:down
```

Use actual repository commands if naming changes.

---

## 192. Performance Workflows

Preserve and run relevant workflows such as:

```text
npm run search:plans
npm run engagement:plans
```

and future subsystem-specific plan commands when the modified code affects them.

---

## 193. Do Not Claim Unrun Checks

Final reports must distinguish:

```text
PASS
FAILED
NOT RUN
UNAVAILABLE
```

Do not state that something passed because the code appears correct.

---

## 194. Browser Claims

If browser/WebGL/realtime visual QA was not actually performed, say so.

Production build + component tests are not the same as browser E2E.

---

# Task Execution

## 195. Inspect First

Before implementing a requested stage:

- inspect the existing repository;
- preserve established conventions;
- identify affected modules and invariants;
- plan migrations/tests before coding.

---

## 196. Prefer Minimal Compatible Change

Do not redesign unrelated architecture while solving one task.

When the existing architecture supports the feature, extend it.

---

## 197. Ask Only Material Questions

Do not stop implementation for minor preferences that can be safely resolved from existing project conventions.

Ask only when the missing information materially changes architecture, security, or product behavior.

---

## 198. Do Not Hide Failures

If verification fails:

- report the exact failing command;
- summarize the real failure;
- fix it if within scope;
- do not describe the stage as complete until acceptance criteria are met.

---

## 199. Completion Report

For substantial implementation tasks, final reports should include as relevant:

```text
Implemented
Architecture
API
Database changes
Concurrency
Security
Tests
Performance/query plans
Verification
Known limitations
Next recommended step
```

Report actual results, not intended results.

---

# Architectural Anti-Patterns to Avoid

## 200. Do Not Reintroduce Vehicle-Only Assumptions

Avoid code that assumes:

```text
Listing always has Vehicle
```

Marketplace code must respect:

```text
VEHICLE | PART
```

---

## 201. Do Not Duplicate Shared Systems Per Category

Do not create:

```text
VehicleMedia + PartMedia
VehicleFavorites + PartFavorites
VehicleMessaging + PartMessaging
VehicleAudit + PartAudit
```

when common Listing identity already solves ownership.

---

## 202. Do Not Flatten All Subtypes Into Listing

The opposite extreme is also wrong.

Do not move every Vehicle/Part field into one giant `listings` table with dozens of nullable columns.

Use explicit subtype data.

---

## 203. Do Not Build One Giant Nullable DTO

Prefer discriminated DTOs and subtype projections.

---

## 204. Do Not Use Redis as Business Storage

Redis failure must not erase authoritative business state.

---

## 205. Do Not Use Client-Side Security

Frontend route guards and hidden controls improve UX only.

Backend authorization is mandatory.

---

## 206. Do Not Leak Exact Location

Never introduce fallback from missing `publicPoint` to `exactPoint`.

Not in:

- list;
- detail;
- map;
- cluster;
- notification;
- Saved Search;
- logs.

---

## 207. Do Not Cluster Truncated Client Data as Truth

Map clusters must represent the actual matching public points, not merely the first limited marker page.

---

## 208. Do Not Duplicate Search Semantics

Saved Searches, map filters, and future matching logic should reuse canonical Search semantics.

---

## 209. Do Not Tie Business Transactions to External Delivery

Do not call slow external email/push providers inside a Listing/moderation/message database transaction.

Persist durable intent first.

---

## 210. Do Not Assume Exactly-Once Background Processing

Outbox and worker consumers must tolerate replay.

---

# Future Extension Principles

## 211. New Marketplace Categories

If a third marketplace category is introduced later:

first evaluate extending the common Listing root + explicit subtype model.

Do not clone the entire marketplace subsystem.

---

## 212. Organizations / Dealers

Future dealer/company seller support must not require changing Vehicle legal ownership semantics.

Marketplace seller identity should evolve deliberately rather than attaching organization ownership directly to Vehicle.

---

## 213. OpenSearch

If introduced later, PostgreSQL remains the source of truth.

A secondary search index must be rebuildable from authoritative data.

---

## 214. External OEM / Compatibility Provider

If external verified compatibility is introduced:

keep distinction between:

```text
seller-declared fitment
verified/catalog fitment
```

Do not silently overwrite provenance.

---

## 215. Shipping / Orders / Payments

Future Parts commerce features such as:

- shipping;
- reservation;
- cart;
- checkout;
- payment;
- partial inventory sale;

are separate domains.

Do not overload current Listing/Part lifecycle with accidental order-management semantics.

---

## 216. Realtime

Future realtime Messaging/Notifications must use durable PostgreSQL state as truth.

WebSocket delivery is transport.

Missed events must be recoverable through authoritative HTTP/database state.

---

## 217. Commercial Features

Features such as:

- promoted listings;
- subscriptions;
- dealership plans;
- VIN/history integrations;
- financing;
- insurance;
- recommendation engines;

must integrate without weakening current marketplace correctness and privacy boundaries.

---

# Final Rule

## 218. Preserve the System's Invariants

When uncertain, prefer the design that preserves:

```text
one common Listing identity
explicit product subtypes
backend authorization
database integrity
private exact location
public allowlisted DTOs
transactional concurrency safety
durable events
idempotent workers
measured database performance
clear module ownership
```

Do not trade these invariants for implementation convenience.