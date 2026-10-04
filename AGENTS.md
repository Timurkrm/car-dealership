# AGENTS.md

## 1. Purpose

This repository contains **Automotive Marketplace**, a production-oriented multi-category marketplace for:

- `VEHICLE` — automobiles;
- `PART` — automotive parts.

The system is intended for long-term ownership, scaling, production deployment, and eventual handoff to a large corporate client.

The product is no longer vehicle-only.

Cars and Parts are first-class marketplace categories sharing common platform capabilities while preserving their own domain semantics.

When changing the system, optimize for:

1. correctness;
2. security;
3. data integrity;
4. maintainability;
5. reliability;
6. simplicity;
7. testability;
8. observability;
9. predictable performance;
10. accessibility;
11. production operability;
12. future scalability.

Do not optimize for implementation speed at the expense of architectural integrity.

---

# 2. Current Product Identity

Use the canonical product name:

```text
Automotive Marketplace
```

Avoid reintroducing legacy product naming such as:

```text
Vehicle Marketplace
```

where the text refers to the complete Cars + Parts product.

Repository URLs or historical identifiers do not need to be renamed merely for cosmetic consistency.

Cars and Parts must be treated as equal marketplace categories.

---

# 3. Read Before Changing Code

Before modifying an unfamiliar area:

1. inspect the current implementation;
2. read relevant documentation under `docs/`;
3. inspect entities and migrations;
4. inspect current API/application contracts;
5. inspect existing tests;
6. identify module ownership;
7. identify existing security/privacy invariants;
8. identify concurrency rules;
9. preserve useful working code;
10. understand current deployment/runtime implications.

Do not rewrite functioning subsystems because another style is personally preferred.

Repository behavior and established architectural decisions take precedence over speculative redesign.

---

# 4. Scope Discipline

Implement only the requested scope.

Do not silently start another product stage.

Do not introduce unrelated:

- commercial functionality;
- frameworks;
- infrastructure;
- providers;
- background jobs;
- microservices;
- external integrations;
- admin capabilities;
- search engines;
- payment systems;
- shipping/order systems;
- mobile applications.

A good change solves the requested problem while keeping future development possible.

It does not pre-build hypothetical future products.

---

# 5. Repository Structure

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

Introduce `packages/` only when genuine cross-application reuse exists.

Do not create generic dumping grounds such as:

```text
common/
shared/
utils/
helpers/
```

without a clear cohesive responsibility.

Shared code must exist for a specific architectural reason.

---

# 6. Core Technology Stack

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
Socket.IO
```

Frontend:

```text
Next.js
React
TypeScript
App Router
MapLibre GL JS
```

Development/test object storage:

```text
MinIO
```

MinIO is not a business-level dependency.

Application storage code must remain compatible with the required S3 contract rather than MinIO-specific behavior.

---

# 7. Architecture Style

Use a **Modular Monolith**.

Do not introduce microservices merely because a subsystem might theoretically be extracted in the future.

Current modules cover responsibilities such as:

```text
auth
account
users
vehicles
parts
listings
media
geo
search
favorites
saved searches
messaging
notifications
email delivery
moderation
admin
audit
```

Workers remain separate executable processes while sharing the same application/module architecture.

Separate process does not mean separate microservice.

Possible future extraction of Search, Geo, Media, Messaging, Notifications, or Analytics must remain possible, but extraction requires a concrete operational need.

---

# 8. Module Ownership

Every domain concept must have an owning module.

Avoid:

- circular dependencies;
- direct access to another module's private persistence implementation;
- importing another module's private services;
- duplicated cross-module business logic.

Prefer public application contracts between modules.

Do not use `forwardRef()` as the default solution to module cycles.

A dependency cycle usually indicates misplaced responsibility.

---

# 9. Controllers Stay Thin

Controllers are transport adapters.

They should handle:

- DTO validation;
- auth decorators/guards;
- headers;
- HTTP status;
- response mapping.

Controllers must not contain substantial business logic.

Business behavior belongs in application/domain services.

Persistence-specific TypeORM work belongs near persistence code.

---

# 10. Avoid Giant Services

Do not create thousand-line services responsible for unrelated business capabilities.

Split by cohesive use case or responsibility.

At the same time, do not fragment the application into dozens of meaningless one-method abstractions.

Prefer cohesion over file count.

---

# 11. Avoid Dogmatic Architecture

Use abstraction when it solves a real problem.

Do not introduce excessive:

- interfaces;
- repositories;
- factories;
- command buses;
- handlers;
- mappers;
- adapters;

merely to imitate textbook architecture.

The current modular monolith with explicit boundaries is sufficient.

---

# Marketplace Architecture

## 12. Marketplace Is Multi-Category

At minimum:

```text
ListingType.VEHICLE
ListingType.PART
```

All new marketplace work must respect this.

Never reintroduce an assumption that every `Listing` represents a Vehicle.

---

# 13. Listing Is the Marketplace Root

`Listing` is the common marketplace offer identity.

Common concerns belong to `Listing`, including concepts such as:

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

and other truly common offer/lifecycle state.

`Listing.id` is the common public identity used by shared marketplace capabilities.

---

# 14. Explicit Listing Subtypes

Category-specific data belongs to explicit subtype structures.

Current conceptual model:

```text
Listing
 ├─ VehicleListing -> Vehicle
 └─ PartListing    -> Part
```

Persistence uses explicit subtype tables such as:

```text
vehicle_listings
part_listings
```

Do not flatten Vehicle and Part attributes into a giant nullable `listings` table merely to simplify queries.

---

# 15. No Parallel Marketplace Architecture

Do not create category-specific copies of shared capabilities when common `Listing.id` already provides the correct identity.

Avoid:

```text
part_media
part_favorites
part_messages
part_reports
part_locations
part_audit_logs
vehicle_notifications
part_notifications
```

unless the common capability becomes objectively insufficient and an architectural change is explicitly approved.

---

# 16. Shared Marketplace Capabilities

Cars and Parts share:

```text
Listing lifecycle
seller ownership
optimistic concurrency
Media
Location
Favorites
Saved Searches infrastructure
Conversations
Reports
Moderation
Audit
Notifications
Search orchestration
Geo infrastructure
Map infrastructure
```

Subtype-specific validation may differ.

Do not duplicate the underlying subsystem.

---

# 17. Listing Type Integrity

`Listing.type` and the subtype row must remain consistent.

Invalid examples:

```text
Listing.type = VEHICLE
but only a PartListing exists
```

or:

```text
one Listing owns both VehicleListing and PartListing
```

Enforce subtype integrity through transactions and database constraints where practical.

Never rely only on frontend behavior.

---

# Vehicle Domain

## 18. Vehicle and Listing Are Different

`Vehicle` describes an automobile observation/specification.

`Listing` describes an offer to sell.

Do not merge these concepts.

Seller ownership belongs to `Listing`, not Vehicle.

Do not introduce `Vehicle.ownerId` as marketplace legal ownership semantics.

---

# 19. Vehicle Catalog

Managed vehicle catalog concepts remain separate:

```text
VehicleMake
VehicleModel
VehicleGeneration
```

Typical hierarchy:

```text
Make -> Models -> Generations
```

Avoid redundant fields where relationships already provide the information.

---

# 20. Vehicle Observation Copy-on-Write

Editing one Listing must not silently mutate Vehicle data used by another historical or active Listing.

When current architecture requires observation preservation, Vehicle characteristic changes use the existing copy-on-write semantics.

---

# 21. VIN Privacy

VIN is sensitive marketplace data.

Do not expose VIN through ordinary public DTOs.

Use the established normalization/validation policy.

Do not make VIN globally unique merely because it looks like an identifier: the same physical vehicle may legitimately appear in historical marketplace observations.

---

# Parts Domain

## 22. Parts Is a First-Class Domain

The Parts module owns concepts including:

```text
Part
PartCategory
PartBrand
PartFitment
part-specific validation
part-number normalization
compatibility rules
```

Do not model Part as a Vehicle subtype.

---

# 23. Part Categories

Part categories are database-backed reference data.

They support hierarchy through the current adjacency model.

Do not replace the taxonomy with a hard-coded enum.

Prevent invalid cycles.

Keep the taxonomy extensible.

---

# 24. VehicleMake and PartBrand Differ

Do not conflate:

```text
VehicleMake
```

and:

```text
PartBrand
```

A vehicle make describes the automobile manufacturer.

A PartBrand describes the part manufacturer/brand.

---

# 25. Part Numbers

Parts support distinct concepts such as:

```text
OEM number
manufacturer part number
```

Use the existing canonical normalization logic.

Do not implement separate normalization inside Search or UI.

Do not add global uniqueness unless a future verified catalog model explicitly requires it.

---

# 26. Part Quantity

`quantityAvailable` is Part-offer-specific.

Do not move inventory quantity into root Listing simply because Parts use it.

Preserve existing bounds and constraints.

The current model treats price as per-unit price.

---

# 27. Part Compatibility

Compatibility modes include:

```text
UNIVERSAL
VEHICLE_SPECIFIC
```

Do not create fake catalog entities like:

```text
ALL CARS
```

for universal Parts.

---

# 28. Vehicle-Specific Fitment

Fitments can reference:

```text
VehicleModel
optional VehicleGeneration
optional yearFrom
optional yearTo
```

A Part can have multiple scopes.

If Generation is specified, it must belong to the selected Model.

Year bounds must be valid.

Preserve nullable fitment uniqueness semantics.

---

# 29. Compatibility Is Seller-Declared

Unless a verified external catalog is introduced, compatibility is seller-provided information.

Do not label it as certified or externally verified.

Preserve provenance if verified compatibility is added later.

---

# Listing Lifecycle

## 30. Shared Lifecycle

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

Do not create a separate Parts lifecycle.

---

# 31. Seller Transitions

Use the centralized lifecycle implementation.

Typical transitions include:

```text
DRAFT -> PENDING_MODERATION
REJECTED -> PENDING_MODERATION
PUBLISHED -> SOLD
supported states -> ARCHIVED
```

Do not duplicate transition rules across controllers or subtype modules.

---

# 32. Moderator Transitions

Moderation controls transitions such as:

```text
PENDING_MODERATION -> PUBLISHED
PENDING_MODERATION -> REJECTED
PUBLISHED -> ARCHIVED
```

Moderator removal must remain distinguishable from seller archive through immutable moderation/audit history.

---

# 33. Moderator Removal and Messaging

Existing conversations remain readable to participants after moderator removal.

Current policy:

```text
seller archive -> conversation may remain writable
SOLD          -> conversation may remain writable
moderator removal -> conversation becomes read-only
```

Moderator removal uses the existing persisted send-disabled state.

Frontend may expose:

```text
canSend = false
```

without exposing internal moderation reason or moderator identity.

Do not regress this distinction.

---

# 34. Editing Policy

Seller editing currently applies to appropriate editable states such as:

```text
DRAFT
REJECTED
```

Do not silently make published listings editable.

Published edits require an explicit revision/re-moderation product design.

---

# 35. Submission Completeness Is Subtype-Specific

The lifecycle engine is common.

Submission completeness may differ.

Vehicle requirements can include:

- Vehicle data;
- location;
- READY primary media.

Part requirements can include:

- Part specification;
- category;
- quantity;
- compatibility declaration;
- READY primary media.

Do not duplicate the lifecycle engine merely to implement different completeness rules.

---

# 36. Publication Invariants

Before moderator approval, revalidate publication requirements.

Do not trust only the checks that ran during seller submit.

Corrupted or legacy data must not become public simply because status says `PENDING_MODERATION`.

---

# Ownership and Concurrency

## 37. Seller Identity Comes From Principal

Never accept authoritative `sellerId` from browser input.

Seller identity comes from the authenticated principal.

---

# 38. IDOR Protection

All private owner/participant operations require backend authorization.

When current policy protects resource existence, foreign access returns privacy-preserving `404`.

Frontend hiding is UX, not authorization.

---

# 39. ADMIN Is Not a Universal Ownership Bypass

Administrative privileges do not automatically grant seller-resource ownership.

Use explicit moderation/admin APIs for privileged operations.

---

# 40. Optimistic Concurrency

Listing edits and lifecycle changes use the established atomic version/CAS model.

Preserve `If-Match` contracts where applicable.

A stale write must produce a stable conflict rather than silently overwriting another change.

---

# 41. Lifecycle Commands Need Concurrency Protection

Concurrency rules apply to commands such as:

```text
submit
archive
mark-sold
approve
reject
remove
```

not only `PATCH`.

---

# 42. Transactions

Use transactions when several writes constitute one business operation.

Examples:

- Listing + subtype + location + audit;
- Listing edit + fitments;
- lifecycle transition + notification/outbox;
- moderation resolution;
- refresh rotation;
- message + conversation activity + outbox;
- email-change confirmation.

Keep transactions bounded.

Never perform slow external network I/O while holding database locks.

---

# Authentication, Account and Sessions

## 43. Browser Authentication Strategy

Current architecture:

- short-lived access JWT;
- access token stored in browser memory;
- refresh credential in HttpOnly cookie;
- refresh rotation;
- reuse detection;
- persisted logical sessions.

Do not move access tokens into:

```text
localStorage
sessionStorage
IndexedDB
```

without an explicit security architecture change.

---

# 44. Token Lifetimes

Current configuration is approximately:

```text
access JWT: ~10 minutes
session absolute: ~30 days
session idle: ~7 days
```

Configuration remains authoritative.

Do not duplicate literal durations throughout the application.

---

# 45. Refresh Credentials

Never persist raw refresh tokens.

Persist only safe digests.

Refresh rotation and reuse detection remain transactional and concurrency-safe.

---

# 46. Logical Sessions

`UserSession` is the logical device/browser session.

Refresh rotation must not create a new logical session.

Session management UI operates on logical sessions, not individual refresh-token records.

---

# 47. Session Revocation and Realtime

Database session state is authoritative.

When a session is revoked, realtime disconnection through the session room is best-effort immediate enforcement.

A disconnected/reconnected client must still fail persisted session validation.

Do not depend on the Redis disconnect event as the sole revocation mechanism.

---

# 48. Roles

Current roles include:

```text
USER
MODERATOR
ADMIN
```

A user may have multiple roles.

`USER` is baseline access.

Do not introduce arbitrary dynamic RBAC without a real product requirement.

---

# 49. Persisted Security State

Protected operations must respect current persisted:

- account status;
- roles;
- session state.

Do not rely indefinitely on stale JWT claims after suspension, blocking, role change, or session revocation.

---

# 50. Centralized Authorization

Use established guards/policies/decorators.

Do not scatter code such as:

```ts
if (user.roles.includes('ADMIN')) { ... }
```

through controllers and services.

---

# 51. Account Status

Respect current states such as:

```text
ACTIVE
PENDING_VERIFICATION
SUSPENDED
BLOCKED
```

Suspended/blocked users must not regain access through stale refresh/session assumptions.

---

# 52. Last Admin Protection

Do not allow administrative operations to remove or disable the final active ADMIN in ways that lock out system administration.

---

# 53. Profile

The current user profile remains deliberately small.

Do not turn Profile into an unbounded social-profile subsystem without a product requirement.

`displayName` is currently the principal editable profile field.

Email is not changed through ordinary profile PATCH.

---

# 54. Email Change

Email changes use their dedicated security flow.

Requirements include:

- current-password reauthentication;
- canonical email normalization;
- purpose-specific single-use token;
- digest-only token persistence;
- expiry;
- replacement semantics;
- replay prevention;
- uniqueness recheck;
- session policy;
- security notification.

Do not bypass this through Profile or Admin convenience code.

---

# PostgreSQL and TypeORM

## 55. PostgreSQL Is Source of Truth

Authoritative business data belongs in PostgreSQL.

Redis is not authoritative for:

- Listings;
- Sessions;
- Messages;
- Notifications;
- Favorites;
- Saved Searches;
- moderation state;
- email delivery intent.

---

# 56. Schema Changes Only Through Migrations

Never enable:

```text
synchronize: true
```

Schema changes require explicit TypeORM migrations.

Never rewrite already-applied migration history to make the schema look cleaner.

Add a new migration.

---

# 57. Production Migration Execution

API startup does **not** run migrations.

Production migrations execute as a dedicated deployment job/step.

Only one migration execution should run for a release.

If migration fails, deployment stops.

Do not automatically run `down()` as a generic rollback response.

After new-format data exists, forward repair may be safer than schema rollback.

---

# 58. PostGIS

PostGIS provisioning belongs to privileged infrastructure/migration bootstrap.

Ordinary application startup must not silently install extensions.

---

# 59. Migration Verification

For applicable schema work verify:

```text
clean apply
repeat/no pending migrations
rollback where safe
reapply
ORM schema consistency
```

Do not claim success without executing relevant checks.

---

# 60. Database Naming

Use:

```text
snake_case
```

in PostgreSQL and:

```text
camelCase
```

in TypeScript according to repository conventions.

---

# 61. Public IDs

Use UUIDs for externally visible entity IDs.

Do not expose sequential internal identifiers as public resource IDs.

---

# 62. Time

Use UTC as durable time truth.

Prefer `timestamptz` where appropriate.

Do not mix browser/local wall clocks into authoritative expiry/lease semantics.

For related durable timestamps where clock ordering matters, use consistent database time.

---

# 63. Money

Never use binary floating point for monetary values.

Use existing integer minor units plus explicit currency.

Do not compare currencies as equivalent without an exchange-rate subsystem.

---

# 64. Database Constraints

Use durable constraints where appropriate:

- foreign keys;
- unique constraints;
- check constraints;
- partial unique indexes;
- subtype integrity;
- valid quantity/ranges;
- media primary uniqueness;
- fitment uniqueness.

Application validation improves errors.

The database remains the durable integrity boundary.

---

# 65. Deletion

Choose `ON DELETE` semantics deliberately.

Avoid blanket cascades.

Audit, security, moderation, and messaging history must not disappear accidentally with an entity deletion.

Soft delete is not a universal default.

Use lifecycle/archive state where it models business meaning.

---

# API

## 66. API Prefix

HTTP API is versioned under:

```text
/api/v1
```

Preserve this convention.

---

# 67. OpenAPI

HTTP contracts remain documented through Swagger/OpenAPI.

When changing endpoints update:

- request schemas;
- response schemas;
- errors;
- auth requirements;
- discriminators.

Production exposure of Swagger is deployment-configurable and should not be accidentally public.

---

# 68. DTOs, Not ORM Entities

Never return ORM entities directly.

Use allowlisted DTOs.

This is especially important for:

- User;
- Listing;
- Vehicle;
- Part;
- Session;
- Media;
- Message;
- Notification;
- Moderation;
- Audit;
- delivery state.

---

# 69. Discriminated Marketplace DTOs

Prefer discriminated unions:

```ts
type PublicListing =
  | PublicVehicleListing
  | PublicPartListing;
```

Do not create one giant nullable DTO containing every possible category field.

---

# 70. Input Allowlisting

Mutation DTOs expose only client-editable fields.

Never accept entity-shaped arbitrary PATCH objects.

Protect system-owned fields from mass assignment.

---

# 71. Errors

Use stable machine-readable application error codes.

Never expose:

- SQL;
- stack traces;
- provider secrets;
- DB hosts;
- storage internals.

Transient database connectivity/unavailability may map to safe generic `503`.

Do not incorrectly map normal business/constraint errors to `503`.

---

# 72. Pagination and Bounded Responses

Potentially large endpoints must be bounded.

Public Search uses cursor/keyset pagination where defined.

Avoid unnecessary exact totals.

Never introduce unbounded collection responses.

---

# Media

## 73. Shared Media Pipeline

Media belongs to common `Listing.id`.

Cars and Parts use the same pipeline.

Do not create separate Part media infrastructure.

---

# 74. Upload Architecture

Current pattern:

```text
initialize
→ presigned direct upload
→ complete / storage verification
→ asynchronous processing
→ READY variants
```

Do not proxy large binary uploads through the API unless there is a strong architectural reason.

---

# 75. Media Security

Treat uploaded content as untrusted.

Preserve:

- type/signature verification;
- dimension/pixel bounds;
- decode validation;
- metadata stripping;
- safe re-encoding;
- bounded processing;
- storage-key privacy.

Raw storage keys and internal source objects must not leak through public DTOs.

---

# 76. Media Publication Requirement

Publication requires the appropriate READY primary media invariant.

Storage failures must not cause incomplete media to appear READY.

---

# 77. Worker Recovery

Media work must remain recoverable after:

- process crash;
- Redis loss;
- queue-state loss;
- transient object-storage failure.

PostgreSQL state remains the durable recovery basis where established.

---

# Search and Geo

## 78. PostgreSQL/PostGIS Search

PostgreSQL/PostGIS remains the initial Search/Geo source of truth.

Do not add OpenSearch/Elasticsearch because it appears fashionable.

A secondary search index requires measured need and a rebuild/correctness design.

---

# 79. Canonical Search Semantics

Cars Search, Parts Search, Map filtering, Saved Searches, and matching logic must reuse the same canonical semantics.

Do not independently reinterpret filters.

---

# 80. URL-Backed Search State

Search state remains reproducible through the URL.

Preserve:

- reload;
- sharing;
- browser back/forward;
- deterministic parsing/serialization.

Homepage quick-search functionality must reuse canonical URL serialization rather than inventing a second filter format.

---

# 81. Cursor Security

Public Search cursors remain:

- opaque;
- integrity-protected/encrypted according to current implementation;
- TTL-bound;
- tied to search/filter semantics.

Do not expose internal keyset state directly.

---

# 82. Geo Privacy

Private location and public location are distinct.

Conceptually:

```text
exactPoint  -> internal filtering/ranking
publicPoint -> public projection
```

Never fallback:

```text
publicPoint missing -> expose exactPoint
```

Not in:

- list;
- detail;
- map;
- cluster;
- notifications;
- Saved Searches;
- logs.

---

# 83. Near Me Privacy

Browser precise geolocation is ephemeral search input.

Do not:

- request it automatically;
- store it in localStorage;
- embed it in Saved Searches;
- expose it in logs;
- put exact coordinates into share URLs unless explicitly approved.

User interaction must trigger location access.

---

# Map

## 84. MapLibre

Frontend map uses MapLibre GL JS.

Map style/provider configuration remains external.

Do not expose provider server secrets to the browser.

Respect attribution requirements.

---

# 85. Map Is Search Projection

Map filters use canonical Search semantics.

List and Map must not return conceptually different result sets for the same filters.

---

# 86. Public Points Only

Map marker/cluster payloads use public-safe coordinates.

Never pass exact Listing coordinates through Map DTOs.

---

# 87. Server-Assisted Clustering

Do not cluster only the first truncated client marker page and treat the result as global truth.

Existing server clustering/aggregation semantics must remain correct for the requested viewport.

---

# 88. Explicit Viewport Search

Preserve explicit:

```text
Search this area
```

behavior where current UX requires it.

Do not silently refetch on every tiny map movement unless redesign explicitly changes this policy.

---

# 89. Map Frontend Performance

Prefer MapLibre source/layer data over hundreds of React DOM markers.

Reuse map instances.

Update source data rather than reconstructing MapLibre repeatedly.

Cancel/ignore stale requests.

Avoid leaking WebGL contexts during navigation.

---

# Moderation and Admin

## 90. Role Separation

`MODERATOR` manages moderation.

`ADMIN` additionally manages account/role/audit operations.

Do not grant MODERATOR implicit ADMIN rights.

---

# 91. Shared Moderation Queue

Cars and Parts share the moderation system.

Moderation must respect Listing type and subtype-specific publication invariants.

---

# 92. Approval and Rejection

Moderation decisions remain:

- state-checked;
- version/CAS protected;
- transactional;
- audited;
- notification-producing where applicable.

Seller-visible moderation feedback and internal moderator notes are separate.

Never expose internal notes or moderator identity to ordinary seller/public projections.

---

# 93. Reports

Reports may target supported resources including:

```text
LISTING
USER
MESSAGE
```

Keep privileged report context bounded.

Message moderation access must not become unrestricted conversation surveillance.

---

# 94. Audit

Audit is append-oriented/immutable under current design.

Do not provide ordinary mutation/delete APIs for historical audit entries.

---

# Favorites, Saved Searches, Notifications and Outbox

## 95. Favorites Are Shared

Favorites reference common `Listing.id`.

Cars and Parts use the same Favorites subsystem.

Unavailable/private Listings return safe tombstone projections rather than leaking old private data.

---

# 96. Saved Searches

Saved Searches reuse canonical Search normalization.

Filters are schema-versioned.

Unknown versions must not execute silently.

Canonical-equivalent filters should produce deterministic fingerprints.

Do not persist precise Near Me coordinates.

---

# 97. Transactional Outbox

Durable asynchronous domain events use the PostgreSQL transactional outbox.

Business mutation and relevant outbox event commit atomically.

Redis/BullMQ must not be the only durability layer.

---

# 98. Outbox Semantics

Assume at-least-once execution.

Consumers are idempotent.

Use:

- bounded claims;
- leases;
- retry/backoff;
- jitter where appropriate;
- stale-lease recovery;
- terminal failed state;
- deduplication/checkpointing.

---

# 99. Domain Event vs Notification

A domain event is not automatically a user Notification.

Keep distinct:

```text
business event
Notification
delivery request
transport
```

Do not conflate them merely for conceptual simplicity.

---

# 100. Notification Payloads

Notification payloads are versioned/type-specific.

Frontend must use type-specific presenters.

Never render arbitrary Notification JSON as trusted UI.

Unknown future/legacy payload types must degrade safely.

---

# 101. Notification Deep Links

Construct internal links from trusted identifiers/type metadata.

Do not persist or execute arbitrary attacker-controlled redirect URLs.

---

# 102. Notification Preferences

Product email preferences and in-app Notification creation are separate concerns.

Turning off a product email preference does not automatically disable the Notification Center.

Mandatory security/account emails are not user-disableable under the current policy.

Saved Search matching semantics remain distinct from email delivery preference.

---

# Email Delivery

## 103. Notification Delivery Is Separate

Keep separate:

```text
Notification
Notification Preference
Delivery Intent
Delivery Attempt/State
Email Provider
```

Do not collapse external delivery state into Notification itself.

---

# 104. Durable Delivery Intent

External email provider calls do not occur inside Listing/Message/Moderation business transactions.

Persist delivery intent first.

PostgreSQL is authoritative for pending delivery.

---

# 105. Delivery Semantics

Email delivery supports durable states such as:

```text
PENDING
PROCESSING
RETRY
SENT
FAILED
SUPPRESSED
```

Workers must handle:

- bounded claims;
- retries;
- exponential backoff;
- jitter;
- provider `Retry-After`;
- leases;
- stale recovery;
- bounded attempts;
- safe error codes.

---

# 106. External Idempotency

Internal dedupe and stable provider idempotency metadata reduce duplicates.

Do not claim exactly-once external email delivery.

An ambiguous provider timeout can still have at-least-once external semantics depending on provider guarantees.

---

# 107. Typed Email Templates

Email rendering is server-owned and typed.

Dynamic HTML must be escaped.

Provide plain text where current template architecture does.

Do not include private:

- exact coordinates;
- storage keys;
- message bodies where intentionally omitted;
- internal moderation notes.

Links derive from canonical configured public application URL, not untrusted Host headers.

---

# Messaging and Realtime

## 108. Reuse Existing Messaging Model

Messaging uses existing:

```text
Conversation
ConversationParticipant
Message
```

Do not create parallel `chat_*` persistence.

---

# 109. Conversation Is Listing-Scoped

Conversation identity relates to common `Listing.id`.

Cars and Parts share one Messaging subsystem.

---

# 110. Participant Integrity

Only conversation participants can access/send within the conversation according to current rules.

Do not trust browser-provided conversation ownership.

---

# 111. Message Privacy

Message bodies are private user content.

Do not place message text into:

- ordinary logs;
- generic audit metadata;
- domain-event payloads;
- metrics labels.

Moderator context remains explicitly privileged and bounded.

---

# 112. Message Idempotency

Message sends use the established client-message idempotency contract.

A retry of the same client operation must not create duplicate Message rows.

Do not remove this merely because realtime appears reliable.

---

# 113. Read State

Read watermark semantics are monotonic.

Do not move read state backwards due to race/retry.

---

# 114. Realtime Is Transport, Not Truth

Socket.IO is best-effort delivery.

PostgreSQL remains authoritative.

The system must recover after:

- reload;
- socket reconnect;
- missed event;
- Redis outage;
- API instance restart.

HTTP reconciliation remains necessary.

---

# 115. One Shared Frontend Realtime Connection

Frontend features must reuse the established shared realtime connection/provider.

Do not create separate persistent Socket.IO connections for:

- Header;
- Messages;
- Notifications;
- Account;
- individual pages.

A UI redesign must not multiply socket connections.

---

# 116. Realtime Authentication

Socket authentication continues to use current access-token/session/origin policy.

Do not move access tokens into URL query strings.

Persisted account/session state remains authoritative after connection.

---

# Redis and Background Work

## 117. Redis Is Not Authoritative

Redis supports ephemeral/coordination capabilities such as:

- rate limiting;
- BullMQ;
- Socket.IO pub/sub;
- temporary coordination.

Redis data loss must not erase authoritative marketplace state.

---

# 118. Background Work Is At-Least-Once

Workers must tolerate duplicate execution.

Do not assume exactly-once delivery.

---

# 119. Job Payloads

Keep job/outbox payloads minimal.

Prefer IDs and versioned safe metadata.

Never enqueue:

- raw media;
- passwords;
- access/refresh tokens;
- exact private location;
- entire ORM entities.

---

# 120. Worker Processes

Current runtime includes independent processes for:

```text
API
Media Worker
Engagement Worker
Delivery Worker
```

Workers remain part of the modular monolith release.

Do not convert them into microservices without concrete operational justification.

---

# 121. Graceful Worker Shutdown

Workers stop claiming new work and allow bounded active work to complete where practical.

Durable lease/recovery semantics must make crash/shutdown recoverable.

---

# Security

## 122. Security Is Enforced on Backend

Hidden controls and frontend route guards improve UX only.

Backend authorization is mandatory.

---

# 123. Threat Model

Always consider as applicable:

- IDOR;
- mass assignment;
- SQL injection;
- XSS;
- CSRF;
- SSRF;
- open redirect;
- upload attacks;
- decompression/pixel bombs;
- rate-limit abuse;
- cursor tampering;
- privilege escalation;
- stale writes;
- private-location leakage;
- token/session replay;
- secret leakage.

---

# 124. SQL Safety

Use parameter binding.

Sort/order/filter SQL fragments use allowlists.

Never interpolate arbitrary user input into raw SQL.

---

# 125. XSS

User text is plain text unless explicitly designed otherwise.

Do not treat as trusted HTML:

- Listing titles;
- descriptions;
- Part names;
- messages;
- report text;
- moderation notes;
- display names.

Avoid unsafe `innerHTML`/`dangerouslySetInnerHTML` unless there is a reviewed, necessary, sanitized use case.

---

# 126. CSRF / Origin

Cookie-authenticated security-sensitive endpoints preserve the current Origin/SameSite policy.

Do not weaken it to fix a frontend inconvenience.

Bearer-token requests have different CSRF semantics.

---

# 127. Secrets

Never commit secrets.

Do not bake production secrets into images or frontend bundles.

`.env.example` contains placeholders or safe development defaults only.

Production config validation should reject insecure critical configuration.

---

# 128. Never Log Secrets

Never log:

- passwords;
- password hashes;
- raw refresh/access tokens;
- verification/reset/email-change tokens;
- cookies;
- Authorization header;
- presigned upload URLs;
- S3 credentials;
- provider credentials.

---

# 129. Geographic Logging

Do not log exact browser location in ordinary application logs.

Metrics must never use coordinates as labels.

---

# 130. Rate Limiting

Use endpoint-appropriate limits.

Authentication, Search, Geo/Map, uploads, reports, messaging, and engagement actions have different abuse profiles.

Do not replace them with one global threshold.

Security-sensitive fail-closed behavior during Redis outage must not be casually changed.

---

# Frontend Architecture

## 131. Next.js App Router

Follow the existing App Router architecture.

Do not introduce a parallel SPA architecture or second routing system.

---

# 132. Typed API Access

Use established frontend API/client infrastructure.

Do not scatter ad hoc `fetch()` implementations when an existing typed client/helper covers the operation.

---

# 133. Server vs Client Components

Keep components server-compatible where possible.

Do not add `"use client"` to large component trees merely for:

- styling;
- static rendering;
- simple links;
- non-interactive layout.

Client boundaries should exist for actual browser state/interactivity.

---

# 134. Request Races

Search/filter/map requests must cancel or ignore stale responses.

An older slow response must never overwrite newer user state.

---

# 135. Async UX States

Every meaningful async screen/action deliberately handles relevant states:

```text
loading
success
empty
error
conflict
retry
```

Do not leave substantial UI blank during network work.

---

# 136. Accessibility

Use semantic HTML and native interactive elements.

Preserve:

- keyboard navigation;
- focus visibility;
- labels;
- ARIA where needed;
- accessible names;
- logical tab order.

Map remains supplemental.

An accessible List alternative must remain available.

---

# 137. Responsive UX

Desktop and mobile are first-class.

Do not create desktop-only:

- marketplace search;
- seller workflow;
- messaging;
- account/security;
- moderation/admin workflow.

---

# Frontend Design System

## 138. Canonical Design Direction

The current product design direction is:

```text
Clean European Automotive Marketplace
```

It should feel:

- modern;
- clean;
- neutral;
- professional;
- trustworthy;
- information-oriented;
- suitable for a large marketplace;
- brandable for a future corporate client.

Avoid:

- cyberpunk;
- neon-heavy interfaces;
- gaming aesthetics;
- black/gold luxury;
- dark-only design;
- heavy glassmorphism;
- excessive gradients;
- animation-first UI;
- oversized marketing hero patterns that hide marketplace functionality.

---

# 139. Design-System Source of Detail

Architectural UI rules live in this file.

Detailed visual definitions live in:

```text
docs/frontend/design-system.md
```

Do not duplicate every literal:

- color;
- radius;
- spacing value;
- type size;

inside `AGENTS.md`.

When visual tokens change, update the design-system documentation.

---

# 140. Shared UI Layer

Reusable foundation components live in the established frontend UI layer:

```text
apps/web/src/components/ui
```

or its current repository-equivalent location if structure evolves deliberately.

Feature/domain components may depend on shared UI.

Shared UI must not depend on Cars/Parts feature modules.

---

# 141. Reuse Existing Primitives

Before creating a new primitive, inspect existing shared components.

Current foundation includes concepts such as:

```text
Button
IconButton
Input / Field
Select
Checkbox
Radio
Switch
SearchInput
Chip
Badge
Card
Divider
Dialog
Alert
Spinner
Skeleton
LoadingState
EmptyState
ErrorState
layout/container primitives
```

Do not create duplicates such as:

```text
NewButton
CarButton
FancyButton
Card2
NewInput
```

for visual differences already expressible through existing controlled variants.

---

# 142. Design Tokens Are Mandatory

New product UI styling must use the established token system for:

- colors;
- surfaces;
- typography;
- spacing;
- radii;
- shadows;
- control sizes;
- responsive containers.

Avoid arbitrary feature-local values when a token already exists.

Do not reintroduce random colors and spacing across features.

---

# 143. Styling Architecture

Preserve the current lightweight styling approach.

The current design-system architecture is conceptually:

```text
tokens
→ existing layouts
→ foundation styles
→ reusable primitives
→ feature components
```

Do not migrate the frontend to another styling framework merely for aesthetics.

---

# 144. Do Not Introduce a New UI Framework Casually

Do not add large frameworks such as:

- MUI;
- Chakra;
- Ant Design;
- Mantine;
- Bootstrap;
- another full component suite;

without an explicit architectural need.

The existing custom foundation should be extended first.

---

# 145. CSS-in-JS

Do not introduce runtime CSS-in-JS if the repository does not already require it.

Keep styling compatible with the current ordinary CSS/token architecture.

---

# 146. Light-First Product

The primary product UI is light-first.

Dark mode is not currently a required feature.

Design tokens should remain structured enough that future theming does not require a rewrite, but do not implement dark mode without scope.

---

# 147. Typography

Use the current system sans-serif typography unless an explicit product decision changes it.

Do not add decorative automotive display fonts.

Typography should prioritize:

- readability;
- information scanning;
- stable layout;
- performance.

Price, metadata, headings, and body text use the established design-system hierarchy.

---

# 148. Cars and Parts Share One Visual System

Cars and Parts use one design language.

They may have different feature-component anatomy because the information differs.

For example:

```text
Vehicle card:
year
mileage
fuel
transmission
location
price
```

versus:

```text
Part card:
brand
condition
part/OEM number
compatibility
stock
price/unit
```

This difference must not become two separate design systems.

---

# 149. Density Can Differ by Product Area

The system may use different information density:

```text
Public marketplace -> visual / image-oriented
Account            -> medium density
Admin/Moderation   -> compact/data-oriented
```

But they must share:

- typography;
- controls;
- colors;
- spacing principles;
- statuses;
- focus styles;
- component primitives.

---

# 150. UI Redesign Must Not Change Business Semantics

A presentation redesign must not silently change:

- Listing lifecycle;
- auth/session behavior;
- Search filters;
- API contracts;
- Map filtering;
- ownership;
- concurrency;
- moderation behavior;
- notification semantics;
- messaging semantics.

UI improvements are not permission to redesign domain behavior.

---

# 151. Feature Migration Is Incremental

Move old UI toward the design system gradually.

Do not perform a risky global rewrite just to eliminate legacy CSS.

Remove legacy styles only after the corresponding feature is actually migrated.

---

# 152. Accessible Names Are Contracts

Playwright and accessibility flows rely heavily on semantic:

- roles;
- labels;
- accessible names.

Do not casually rename accessible controls only for stylistic wording.

If an accessible name changes intentionally, update tests and verify the UX reason.

Do not solve E2E failures by adding large amounts of unnecessary `data-testid`.

---

# 153. Responsive and Touch Rules

Interactive mobile controls need appropriate touch targets.

Avoid horizontal overflow.

UI should tolerate:

- long display names;
- long labels;
- German/Russian-sized text;
- mobile widths;
- browser zoom/reflow.

Do not design fixed widths solely for short English strings.

---

# 154. Focus and Reduced Motion

Do not remove focus outlines without an accessible replacement.

Use the established `focus-visible` treatment.

Respect:

```text
prefers-reduced-motion
```

Animations remain subtle and functional.

---

# 155. No Fake Marketplace Content

Do not add fake:

- listing counts;
- trust statistics;
- seller ratings;
- availability;
- marketing numbers;
- badges;
- testimonials;

unless the product actually supplies those facts.

Do not hard-code fake Listings into production pages.

Use real API state or honest empty states.

---

# 156. External Images

Do not hotlink random stock images into marketplace UI.

Use actual Listing media or controlled local/product assets.

Missing Listing media uses the established placeholder.

---

# 157. Navigation

Cars and Parts remain equal primary sections:

```text
/cars
/parts
```

Sell uses the common entry and existing type chooser.

Seller workspace remains shared.

Do not hide Parts inside Cars Search.

---

# 158. Global Realtime UI

Header badges, Messages, and Notifications reuse established state/realtime infrastructure.

Do not:

- create a new Socket.IO connection for Header;
- add independent polling loops for every badge;
- duplicate Notification/Message subscriptions.

Reuse the shared client/state architecture.

---

# 159. UI Status Colors

Status styling must use semantic design-system variants rather than feature-local colors.

This includes:

- lifecycle;
- moderation;
- stock;
- errors;
- warnings;
- success;
- informational states.

Do not encode business state using color alone.

---

# 160. Forms

Forms use the shared field patterns.

Preserve:

- visible labels;
- hint vs error distinction;
- disabled/read-only semantics;
- validation accessibility;
- consistent focus;
- loading-submit protection.

Placeholder text is not a replacement for a label.

---

# 161. Dialogs

Use the established accessible Dialog primitive where applicable.

Dialogs must preserve:

- focus trapping;
- Escape behavior;
- focus restoration;
- accessible title;
- backdrop behavior;
- mobile safety.

Do not invent another modal implementation inside a feature.

---

# 162. Loading, Empty and Error States

Use established:

```text
Skeleton
Spinner
LoadingState
EmptyState
ErrorState
Alert
```

according to context.

Do not use fullscreen spinners for every local content load.

Empty state is not an error state.

Do not show technical exceptions to users.

---

# 163. Interactive Semantics

Do not use:

```tsx
<div onClick={...}>
```

when a `button` or `a` is semantically correct.

Avoid invalid nested interactive elements such as a button inside a link-wrapped interactive card.

---

# 164. Frontend Dependencies

Before adding a frontend dependency evaluate:

- whether shared UI already solves the need;
- bundle cost;
- maintenance;
- accessibility;
- security;
- tree-shaking;
- SSR/RSC compatibility.

Do not add a dependency for trivial styling.

---

# 165. Frontend Bundle Discipline

A design change should not force large client-side JavaScript growth without justification.

Keep static components server-compatible.

If adding icons, import only required icons rather than entire libraries.

---

# Observability

## 166. Structured Logging

Backend runtime logs remain structured JSON in production.

Include safe operational metadata such as:

- request ID;
- safe IDs;
- operation/event type;
- duration;
- attempt count.

Do not dump arbitrary request bodies.

---

# 167. Request IDs and Async Correlation

Preserve request/correlation infrastructure.

Async jobs may preserve causal/event identifiers where useful.

Do not fabricate a historical HTTP request ID for unrelated later work.

---

# 168. Health and Readiness

Preserve:

```text
/api/v1/health
/api/v1/health/ready
```

Liveness means process health.

Readiness reflects whether the instance can safely serve core traffic.

PostgreSQL is readiness-critical.

Redis, S3, Email, and Map dependencies follow their documented degradation semantics and must not automatically make all core traffic unavailable.

---

# 169. Metrics

The project exposes low-cardinality internal operational metrics.

Do not add high-cardinality labels such as:

```text
userId
listingId
conversationId
requestId
email
coordinates
raw search query
```

Metrics/internal operational routes are not normal public application endpoints.

Production ingress should restrict them.

---

# 170. Slow Operations

Preserve slow-request/job/query observability where established.

Log operation class and duration, not sensitive payloads.

---

# Performance

## 171. Avoid N+1

Collection/detail queries must be reviewed for N+1 behavior.

Prefer projections/batching over loading large ORM graphs.

---

# 172. Bound External Work

Externally triggered operations remain bounded:

- page size;
- map features;
- radius;
- filters;
- fitments;
- media count;
- Saved Searches;
- worker batches;
- delivery attempts.

---

# 173. Cache Carefully

Do not add Redis caching merely because Redis is available.

Every cache requires a correctness and invalidation story.

Incorrect cache is worse than no cache.

---

# 174. Query Timeouts

Respect current database statement/lock/transaction timeout policy.

Do not fix a slow query simply by raising its timeout.

Investigate the plan first.

---

# 175. No Premature Denormalization

Do not add duplicate fields solely to avoid reasonable joins.

Denormalization requires:

- measured need;
- consistency strategy;
- migration;
- explicit ownership.

---

# 176. Geo Is a Known Expensive Class

Broad low-zoom Map/Geo aggregation remains one of the more expensive query classes.

Preserve:

- limits;
- rate limits;
- statement timeout;
- server-side clustering;
- observability.

Do not prematurely introduce vector tiles or another Geo platform unless staging/production measurements justify it.

---

# Infrastructure and Deployment

## 177. Local Infrastructure

Development/test infrastructure uses Docker Compose conventions.

PostgreSQL/PostGIS, Redis, and MinIO should use:

- health checks;
- isolated test configuration;
- persistent volumes where intended.

---

# 178. Runtime Processes

Current production architecture distinguishes:

```text
Web
API
Media Worker
Engagement Worker
Delivery Worker
Migration Job
```

Frontend and API may scale independently.

Workers use the backend runtime artifact with dedicated entrypoints where current deployment specifies it.

---

# 179. Production Statelessness

HTTP instances remain stateless regarding durable business state.

Do not depend on local process memory or container disk for authoritative application state.

---

# 180. Production Container Model

Current release uses separate production Web and backend runtime images.

Backend runtime supports:

- API;
- workers;
- migration job.

Do not bake secrets into images.

Runtime images should remain non-root/minimal according to current deployment design.

---

# 181. Immutable Release Artifacts

Deployment identity uses immutable version/SHA/digest semantics.

Do not make mutable:

```text
latest
```

the only production identity.

---

# 182. Production Is External Evidence

The repository can be release-ready while actual production remains unprovisioned.

Never claim:

```text
PRODUCTION READY
```

merely because local Compose/reference deployment passed.

Real production claims require evidence for actual:

- infrastructure;
- DNS/TLS;
- managed services;
- secrets;
- providers;
- monitoring;
- backups;
- staging/production smoke.

---

# 183. External Dependencies

Production requires properly configured external services for:

```text
PostgreSQL/PostGIS
Redis
S3-compatible storage
Email provider
Map/style/tile provider
```

and infrastructure services such as:

```text
TLS/DNS
secret management
monitoring/on-call
backup/PITR
container registry
```

Do not hard-code a cloud vendor without client decision.

---

# 184. Production Database Roles

Production guidance distinguishes:

```text
runtime role
migration role
backup/operator role
monitoring role where applicable
```

Runtime application role should not require:

```text
SUPERUSER
CREATEDB
CREATE EXTENSION
```

---

# 185. Redis

Redis remains non-authoritative.

Production requires appropriate:

- private networking;
- authentication;
- TLS;
- persistence;
- HA;
- memory policy.

Do not use an eviction policy that can arbitrarily remove queue/coordination keys without an explicit design.

---

# 186. S3

Use least-privilege object-storage credentials.

Raw source media remains private.

Presigned uploads and controlled/public processed variants must preserve current privacy model.

Production object-storage durability/versioning/lifecycle policy belongs to infrastructure configuration.

---

# 187. Email and Map Providers

Provider configuration is external.

Do not commit provider secrets.

Public browser map credentials, if required by the provider, must be intentionally public-scoped/domain-restricted.

Email sender domains require the relevant provider/DNS setup.

---

# 188. Graceful Shutdown

API and workers follow bounded graceful-shutdown conventions.

Close as applicable:

- HTTP listeners;
- WebSocket resources;
- queues/workers;
- Redis connections;
- DB pools.

Do not let shutdown wait indefinitely.

---

# 189. Deployment Ordering

Database migrations are a dedicated gate.

When introducing new asynchronous event types, deploy consumers capable of reading the event before producers begin emitting it where compatibility requires this.

Code rollback and schema rollback are separate decisions.

Do not automatically execute destructive `down()` during application rollback.

---

# 190. Backup and Recovery

Repository backup/restore tooling is not a replacement for managed production PITR/off-site backup.

Production recovery requires both:

- PostgreSQL data;
- object-storage durability/recovery.

RPO/RTO are business/infrastructure decisions and must not be invented by application code.

---

# Documentation

## 191. Documentation Is Part of the Change

Significant architecture/domain/runtime behavior changes require documentation updates.

Prefer updating authoritative existing documents over creating conflicting parallel documentation.

---

# 192. Important Documentation Areas

Relevant documentation includes:

```text
docs/architecture.md
docs/data-model.md
docs/authentication.md
docs/listings.md
docs/parts.md
docs/media.md
docs/search-and-geo.md
docs/map.md
docs/moderation-and-admin.md
docs/favorites-saved-searches-notifications.md
docs/messaging-and-realtime.md
docs/account-and-email-delivery.md
docs/reliability.md

docs/frontend/design-system.md

docs/operations/
docs/deployment/
docs/release/
docs/handoff/
docs/qa/
docs/adr/
```

Use actual repository paths if documentation is reorganized.

---

# 193. ADRs

Use ADRs for significant architectural decisions.

Do not create an ADR for ordinary implementation details.

An ADR should capture:

- context;
- decision;
- alternatives/trade-offs;
- consequences.

---

# 194. No Developer-Local Paths

Committed docs must not depend on absolute developer-machine paths such as:

```text
F:\...
C:\Users\...
file://...
```

Use repository-relative paths.

---

# 195. Comments and TODOs

Comments explain:

- why;
- constraints;
- non-obvious behavior;
- edge cases.

Do not narrate trivial syntax.

TODOs must describe concrete deferred work.

Do not leave TODOs that hide correctness work required by the current task.

---

# Dependency Discipline

## 196. Add Dependencies Deliberately

Before adding dependencies evaluate:

- existing repository capability;
- maintenance;
- security;
- runtime/bundle cost;
- native build requirements;
- production image impact.

Do not add libraries for trivial functionality.

---

# 197. Lockfile

Keep `package-lock.json` consistent with package manifests.

Use reproducible installation (`npm ci`) in CI/release workflows.

Do not hand-edit inconsistent dependency state.

---

# 198. Security Audit

Preserve dependency and image/security scans according to current workflows.

Do not blindly upgrade unrelated major versions merely to eliminate informational warnings.

No known Critical/High issue should be ignored in a release candidate without explicit documented risk handling.

---

# Coding Standards

## 199. TypeScript

Use strict TypeScript.

Avoid unsafe `any`.

Treat untrusted external data as `unknown` until validated/narrowed.

---

# 200. Existing Domain Types

Reuse existing enums/types.

Do not introduce a second enum/string set for the same canonical domain concept.

---

# 201. Side Effects Must Be Explicit

Do not hide:

- DB mutation;
- event/outbox creation;
- queue publish;
- object deletion;
- Notification fanout;
- provider delivery;

inside innocent-looking formatters/mappers/helpers.

---

# 202. Error Handling

Handle expected business errors explicitly.

Do not catch everything and return success.

Unexpected errors should reach centralized handling after safe contextual logging.

---

# Git and Change Discipline

## 203. Preserve Existing Work

Do not remove unrelated functionality while implementing another task.

Do not rewrite large working areas without necessity.

---

# 204. Migration History

Never rewrite historical migrations to make the current schema prettier.

Production evolves through new migrations.

---

# 205. Generated Artifacts

Do not commit accidental local artifacts such as:

- runtime logs;
- `.env` secrets;
- database dumps;
- temporary performance datasets;
- Playwright runtime report folders;
- screenshots/videos unless intentionally retained as documentation;
- Docker caches.

Follow current `.gitignore`/repository policy.

---

# 206. Release Discipline

Do not rewrite Git history simply to manufacture a cleaner project story.

Use logical commits and release tags going forward.

Release provenance must correspond to the actual committed source used to build artifacts.

---

# Testing

## 207. Tests Are Required

Changes require tests appropriate to risk.

Available levels include:

```text
unit
HTTP/controller
integration
frontend/component
browser E2E
security
resilience
performance/query-plan
```

Do not write tests that merely restate implementation.

Protect behavior and invariants.

---

# 208. Playwright Is Established Infrastructure

Playwright is now a real repository regression gate.

Do not treat browser testing as hypothetical.

Current browser coverage includes supported modern classes such as:

- Chromium;
- Firefox;
- WebKit;
- mobile emulation.

Substantial frontend changes must run the applicable browser E2E suite.

Do not claim real-device certification merely because emulation passed.

---

# 209. Accessibility Regression

Preserve existing axe/browser accessibility checks.

For significant UI changes verify:

- no serious/critical violations in covered flows;
- keyboard behavior;
- focus;
- semantic controls;
- responsive/reflow behavior.

Automated checks do not replace every possible screen-reader/manual accessibility audit.

---

# 210. Security Regression

Preserve tests for relevant:

- IDOR;
- ownership;
- mass assignment;
- XSS;
- CSRF/Origin;
- CORS;
- JWT/session behavior;
- token replay;
- upload security;
- exact-location leakage;
- role separation.

---

# 211. Concurrency Regression

When changing concurrency-sensitive behavior, preserve or add coverage for:

- Listing CAS;
- lifecycle races;
- moderation races;
- media races;
- auth refresh;
- session revoke;
- messaging idempotency;
- read watermark;
- worker claims;
- delivery dedupe.

---

# 212. Development Benchmark Disclaimer

Local:

- query timings;
- load tests;
- media throughput;
- socket capacity;

are development observations, not production SLA.

Never present them as guaranteed production capacity.

---

# Verification

## 213. Core Verification

For substantial changes run the relevant current commands.

Core gates normally include:

```text
npm run lint
npm run typecheck
npm test
npm run build
```

---

# 214. Frontend/UI Verification

For substantial frontend redesign work, normally run:

```text
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run docs:check
```

Use actual repository command names if they change.

Do not call a UI stage complete if the applicable Playwright suite fails.

---

# 215. Database/Integration Verification

Where applicable:

```text
npm run infra:test:up
npm run migration:run
npm run test:integration
npm run infra:test:down
```

Use repository-equivalent commands when names change.

---

# 216. Security and Reliability Verification

When affected, run applicable gates such as:

```text
npm run test:security
npm run resilience:test
npm run ops:restore-test
npm run ops:verify-data
npm run maintenance:cleanup -- --dry-run
```

Do not run unrelated expensive workflows merely for appearance.

---

# 217. Query/Performance Workflows

Run affected plan workflows such as:

```text
npm run search:plans
npm run moderation:plans
npm run engagement:plans
npm run messaging:plans
npm run account-delivery:plans
```

when relevant code changes can affect them.

---

# 218. Do Not Claim Unrun Checks

Reports must distinguish actual states:

```text
PASS
FAILED
NOT RUN
UNAVAILABLE
```

Do not say a check passed because code looks correct.

---

# 219. Browser Claims

Production build, TypeScript, and component tests are not equivalent to browser E2E.

Browser/WebGL/realtime behavior can be claimed only if actually exercised by the appropriate browser tests/manual checks.

---

# Task Execution

## 220. Inspect First

Before implementing:

- inspect current repository state;
- read relevant docs;
- identify affected modules/components;
- identify invariants;
- identify migration implications;
- identify test implications.

---

# 221. Prefer Minimal Compatible Change

Extend existing architecture where it already supports the requirement.

Do not redesign unrelated areas.

---

# 222. Ask Only Material Questions

Do not halt work for minor preferences that can be resolved from established repository conventions.

Ask when missing information materially affects:

- architecture;
- security;
- data integrity;
- product behavior;
- external infrastructure decisions.

---

# 223. Do Not Hide Failures

If verification fails:

1. report the exact failing command;
2. identify the real failure;
3. fix it if within scope;
4. rerun the relevant check;
5. do not call the task complete while required acceptance gates fail.

---

# 224. Completion Reports

For substantial tasks report applicable sections such as:

```text
Implemented
Architecture
Frontend/UI
API
Database changes
Concurrency
Security
Accessibility
Tests
Performance
Verification
Known limitations
Next recommended step
```

Report what was actually executed.

---

# Architectural Anti-Patterns

## 225. Do Not Reintroduce Vehicle-Only Assumptions

Wrong:

```text
Listing always has Vehicle
```

Correct marketplace root:

```text
VEHICLE | PART
```

---

# 226. Do Not Duplicate Shared Systems

Avoid parallel:

```text
VehicleMedia + PartMedia
VehicleFavorites + PartFavorites
VehicleMessaging + PartMessaging
VehicleNotifications + PartNotifications
```

when common Listing identity already solves the relationship.

---

# 227. Do Not Flatten Every Subtype Into Listing

Do not create one giant `listings` table or DTO with dozens of category-only nullable fields.

Use explicit subtype structures.

---

# 228. Do Not Use Redis as Business Storage

Redis loss must never erase authoritative business state.

---

# 229. Do Not Use Frontend as Security Boundary

Frontend route guards, disabled buttons, and hidden navigation are not authorization.

Backend enforcement is mandatory.

---

# 230. Do Not Leak Exact Location

Never expose `exactPoint` through public fallback behavior.

---

# 231. Do Not Duplicate Search Semantics

Search, Map, Saved Searches, matching, and homepage filter entrypoints reuse canonical Search definitions.

---

# 232. Do Not Tie Business Transactions to External Delivery

Do not call email/provider APIs while holding business database transactions.

Persist durable intent.

---

# 233. Do Not Assume Exactly-Once

Outbox, queues, delivery workers, and realtime must tolerate replay/missed transport.

---

# 234. Do Not Bypass the Design System

Do not solve visual tasks by introducing feature-local replacements for existing shared primitives or tokens.

Before creating a new UI primitive:

1. inspect `components/ui`;
2. inspect `docs/frontend/design-system.md`;
3. decide whether the requirement is a new semantic component or merely another visual variant.

---

# 235. Do Not Change Business Logic During UI Redesign

A frontend redesign task is not authorization to alter:

- endpoint semantics;
- DB state;
- lifecycle rules;
- Search behavior;
- security policy;
- concurrency contracts.

If UI work uncovers a backend defect, report/fix it explicitly as a correctness issue rather than silently embedding new frontend semantics.

---

# Future Extension Principles

## 236. New Marketplace Categories

If another marketplace category is introduced:

first evaluate extending:

```text
Listing root + explicit subtype
```

Do not clone the marketplace architecture.

---

# 237. Organizations / Dealers

Future dealer/company seller support must evolve seller identity deliberately.

Do not attach organization ownership semantics directly to Vehicle.

---

# 238. External Search Platform

If OpenSearch or another search engine is introduced later:

PostgreSQL remains authoritative.

The secondary index must be rebuildable.

---

# 239. External OEM / Compatibility Provider

If verified compatibility is added, preserve distinction between:

```text
seller-declared fitment
verified/catalog fitment
```

Do not erase provenance.

---

# 240. Shipping / Orders / Payments

Future Parts commerce features such as:

- shipping;
- reservations;
- cart;
- checkout;
- payment;
- order fulfillment;
- partial inventory sales;

are separate business domains.

Do not overload current Listing/Part lifecycle with accidental order-management semantics.

---

# 241. Future Geo Scaling

If measured production/staging demand eventually requires it, future paths may include:

- deeper SQL optimization;
- different aggregation strategies;
- MVT/vector tiles;
- specialized Geo/Search infrastructure.

Do not implement these solely from local benchmark anxiety.

---

# 242. Future UI Themes

A future:

- dark theme;
- client branding layer;
- white-label system;

should extend the token/design-system architecture.

Do not duplicate the entire frontend.

---

# Core Invariants

Before completing substantial work, verify that the following still hold:

1. `Listing` remains the common marketplace identity.
2. Cars and Parts use explicit subtype data.
3. Cars and Parts share platform capabilities where semantics are common.
4. Seller identity comes from authenticated principal.
5. Backend authorization protects every private resource.
6. ADMIN does not accidentally bypass seller ownership APIs.
7. Listing mutations preserve optimistic concurrency.
8. Publication revalidates current invariants.
9. PostgreSQL remains authoritative.
10. Redis remains ephemeral/non-authoritative.
11. Database changes happen only through migrations.
12. `synchronize` remains disabled.
13. Exact location never leaks publicly.
14. Public Map uses public-safe location.
15. Search/Map/Saved Search semantics remain canonical.
16. Media processing remains bounded and recoverable.
17. External provider I/O remains outside business transactions.
18. Outbox/workers tolerate at-least-once execution.
19. Notifications and email delivery remain separate concepts.
20. Messaging remains Listing-scoped and participant-protected.
21. Realtime remains best-effort transport over durable state.
22. Frontend uses one shared realtime connection architecture.
23. Access JWT remains memory-only in browser.
24. Refresh credentials remain HttpOnly and digest-backed.
25. Session/account changes respect persisted security state.
26. Current UI changes reuse the shared design system.
27. UI redesign does not alter domain/API behavior accidentally.
28. Cars and Parts remain visually equal marketplace categories.
29. Accessibility remains a first-class requirement.
30. Playwright remains a required browser regression gate for substantial frontend work.
31. Production migrations remain a dedicated deployment step.
32. Production artifacts remain immutable/versioned.
33. Internal metrics/ops endpoints do not become public application surfaces.
34. Repository readiness is not falsely described as actual production readiness.
35. Verification reports describe commands that actually ran.