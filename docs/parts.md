# Automotive parts marketplace

## Overview

Parts is an independent product domain in the modular monolith, using existing
Listings, Media, Geo, Users and Audit systems. PostgreSQL is authoritative. No new
services, dependencies, warehouses, delivery integration or advanced search engine
are introduced. See [ADR 0007](adr/0007-multi-category-listings.md).

## Listing architecture

Listings owns root `listings`, `vehicle_listings`, and `part_listings`. Root fields
are UUID, `type` VEHICLE/PART, seller, title/description, int64 minor-unit price and
explicit currency, lifecycle, UTC timestamps and optimistic version. `vehicle_id`
is now on the vehicle subtype; all old root IDs survive migration unchanged.

Parts owns `parts`, `part_categories`, `part_brands`, `part_fitments`. Dependencies
are Listings -> Parts -> Vehicles; no circular module imports. Parts validates
catalog compatibility through Vehicles' exported application API. Media implements
Listings' existing injected port, including a targeted READY primary read projection.

Subtype PKs allow one row per root, constant-type CHECKs and composite root FKs
prevent wrong-type links. Unique part_id prevents sharing mutable part specifications
between offers. Exactly-one-link completeness is enforced by atomic application
creation, not a DB trigger. No public arbitrary root/subtype creation API exists.
Vehicle observation edits retain historical copy-on-write behavior.

## Categories

Database adjacency hierarchy: UUID, nullable parentId, name, unique canonical slug,
isActive and sortOrder. FK RESTRICT and self-parent CHECK are authoritative.
`PartCatalog.setParent` requires the caller's transaction and serializes hierarchy
changes with a transaction advisory lock, then walks ancestors and rejects cycles.
No public category mutation/admin UI is exposed. Future admin callers must enforce
permissions/audit and use this contract; arbitrary SQL can bypass transitive cycle policy.
Creation/update/submission require active category references. Public catalog reads
return active records only, ordered sortOrder/name/UUID; filter matches exact category,
not implicit descendant expansion. Response retains parentId for building a tree.

## Brands

Optional database-backed brand UUID/name/slug/isActive. Active references required
when specified on drafts and submission. Null means unbranded/unknown; not inferred
from OEM number or display names. Public catalog is ordered name/UUID. Referenced
categories/brands cannot be deleted. Historical product detail retains reference names.

`npm run seed:catalog` adds a small **development-only** category/brand fixture
alongside existing vehicle catalog. It is idempotent and resolves existing category
parents by slug. It preserves custom existing records and never seeds production
master data or business offers; migrations contain no taxonomy seed.

## Part

Product name is distinct from offer title. Required category, optional brand,
condition NEW/USED/REFURBISHED/FOR_PARTS, optional manufacturerPartNumber and oemNumber,
and fitmentMode. Numbers are trim/uppercase ASCII, 1-100 chars when present,
allowing spaces, dot, underscore, slash and hyphen; meaningful separators survive.
Null clears a number; empty non-null numbers are invalid. Stored canonical values
have CHECKs and nonunique partial indexes. Numbers are not globally unique:
multiple sellers and units may legitimately sell the same product.

`part_listings.quantityAvailable` is draft-editable integer 1-1,000,000. DB allows
0-1,000,000 because SOLD has zero. Price is **per unit** using existing exact int64
minor strings and reviewed currency allowlist. No inventory reservation/orders exist.
Manual mark-sold closes the whole offer, sets stock to zero atomically and preserves
detail/history. There is no partial-sale endpoint or automatic stock decrement.

## Fitment

VEHICLE_SPECIFIC fitment has 0-50 rows in a draft, at least one for submission.
Each row has required modelId, optional generationId and nullable yearFrom/yearTo
(1886-2100, inclusive, from <= to). Make is derived through the model; generation
must belong to that model. Composite DB FK protects the same relation. No generation
means all generations of that model, within optional years; null years are open bounds.
Generation catalog production years are descriptive, not a second fitment constraint.
Fitment is the seller's statement, not verified OEM compatibility.

Rows are replaced atomically, not appended implicitly. Duplicate identical model,
generation and year scope is rejected in validation and DB `NULLS NOT DISTINCT`
unique index. Overlapping different ranges are allowed, not automatically merged.

## Universal parts

UNIVERSAL has no fitment rows. Requests containing rows are rejected rather than
silently discarded. The editor confirms discarding existing selections when switching
to universal. Switching modes and replacing rows share Listing lock/version/audit.
Basic make/model filtering includes universal offers plus matching specific rows;
a syntactically valid unknown model matches universal offers only. No fuzzy labels,
VIN decoding or address/catalog provider is involved.

## Lifecycle

Existing state engine: DRAFT/REJECTED editable; submit -> PENDING_MODERATION; approval
is still a separate moderation application stage; PUBLISHED -> SOLD; archive preserves
history. Parts submission requires valid active references/specification/fitment,
positive quantity/price, title, description, READY primary with all processed variants
and no unfinished uploads. It does not require location. Seller cannot self-publish.
Vehicle description/location/primary invariants remain unchanged.

## Media

All photos use existing listing_media/variants, private direct uploads, BullMQ worker,
file validation, three READY processed variants, primary selection, reordering, deletion
and cleanup. Shared owner policy and Listing lock freeze changes in moderation and
published/closed states. No part_media or second upload pipeline. Cards fetch primary
thumbnail only, detail uses bounded public gallery; no storage keys in DTOs. URLs are
fresh signed URLs and refresh controls remain available.

## Location

Parts may omit ListingLocation altogether. If supplied, the existing complete location
contract applies: private exact Point 4326, city/country, optional region and independently
supplied publicPoint. Whole location replacement/null removal uses the existing Geo API.
Private exactPoint appears only on owned detail; public detail/list never falls back to it.
Shipping, metadata-only locations and Parts radius/viewport search are deferred.

## Public/private DTOs

Common seller list/detail is a type-discriminated VEHICLE/PART union. Vehicle members
have vehicle; Part members have part. No giant optional graphs. Part detail includes
canonical numbers and bounded full catalog fitments; summary contains mode/count only.
No public VIN, exact point, seller email/ID, versions, moderation, audit or storage keys.
Owner responses contain version and matching ETag, timestamps and optional exactPoint.
Backend and frontend map allowlisted fields, never serialize ORM entities directly.

## API

All paths are under `/api/v1`:

| Method / path                                            | Contract                                                                                           |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| GET `/catalog/part-categories`                           | Active hierarchy nodes, limit/offset                                                               |
| GET `/catalog/part-brands`                               | Active brands, limit/offset                                                                        |
| POST `/parts/listings`                                   | Authenticated draft; `{part,quantityAvailable?,listing,location?}`, 201/Location/ETag              |
| GET `/listings?type=PART`                                | Anonymous unified cursor Search/Geo with Parts filters                                             |
| GET `/parts/listings/:id`                                | Anonymous PART PUBLISHED or historical SOLD; wrong type/hidden -> 404                              |
| GET `/me/listings`                                       | Authenticated mixed own summary; optional type VEHICLE/PART, status, created_newest/updated_newest |
| GET `/me/listings/:id`                                   | Shared owned union detail + ETag                                                                   |
| PATCH `/me/part-listings/:id`                            | PART DRAFT/REJECTED partial spec/common fields/quantity, If-Match mandatory                        |
| POST `/me/listings/:id/submit`, `/archive`, `/mark-sold` | Existing shared lifecycle, If-Match and empty body                                                 |
| `/me/listings/:id/media/...`                             | Existing shared Media contract                                                                     |

Part catalog/seller pagination remains `{items,limit,offset,hasMore}`. Public Parts
discovery uses `{items,page:{hasNextPage,nextCursor}}` through the common Search
orchestrator, including category subtree, exact numbers, compatibility, price and
PostGIS filters. The former public offset collection route was removed before external
compatibility was established. See [Search/Geo](search-and-geo.md).

Errors use existing safe API envelope/requestId. Specific validation codes include
PART_INVALID_NUMBER, PART_INVALID_FITMENT, PART_UNIVERSAL_FITMENT_CONFLICT,
PART_INVALID_YEAR_RANGE, PART_DUPLICATE_FITMENT, PART_CATEGORY_NOT_FOUND,
PART_BRAND_NOT_FOUND, PART_CATEGORY_CYCLE, PART_INCOMPLETE and Vehicle catalog codes.
Unexpected fields, wrong payload subtype, invalid quantity/money return VALIDATION_ERROR.
Foreign/missing/wrong subtype returns LISTING_NOT_FOUND; stale If-Match returns
LISTING_VERSION_CONFLICT. Anonymous reads and authenticated writes reuse separate
distributed Redis listing/catalog policies, fail-closed on limiter outage. No new cache.

## Seller workflow

`/sell` offers Vehicle/Part choice; `/sell/car` preserves vehicle form; `/sell/part`
has category/brand/name/condition/quantity/numbers/fitment plus shared Listing fields.
Optional location and money component/payload are reused by both forms. Fitment editor
supports dependent catalog reset, multiple scopes and year-range/duplicate feedback.
Draft save leads to the same `/account/listings/:id` with MediaEditor and lifecycle buttons.
Mixed dashboard supports type filtering and corresponding summary cards/public links.
Owned draft/rejected Part edit uses subtype PATCH; actions stay generic. CAS conflict
preserves unsaved input and disables writes until explicit reload. All async reads
support cancellation/stale-response suppression. `/parts` advanced filters are stored
in the URL and applied explicitly; cursor Load more, facets, near-me, empty/error/loading
states and keyboard labels are provided.

## Migration and verification

`1790000000000-MarketplaceListingSubtypes.ts` adds six tables, root type/composite key,
backfills old Vehicle links before removing vehicle_id, and changes its supporting FK/index.
All common IDs/versions/timestamps/child associations survive unchanged. Down locks
root/products and refuses **any Part product or PART offer**; safe vehicle-only down restores
vehicle_id and old FK/index. Catalog fixture alone can be dropped on down. This is a
coordinated schema/API deployment, not a rolling release compatible with old binaries.

Integration covers populated old-schema migration/rollback/reapply with complete child
snapshots, clean application of every registered migration, ORM diff, subtype/fitment constraints, atomic
create/edit, IDOR, CAS and full real Part Media pipeline. Original vehicle/auth/media/search
suites remain enabled. Run standard README quality gates and `search:plans` to review
both Vehicle and Part production projection plans.

## Shared systems

Favorites, conversations, reports, moderation and audit continue referencing root
Listing.id and are tested with both types at persistence level. Their full HTTP/business
workflows remain separate stages; this task does not claim implemented messaging or
favorite UI. No copied tables or history engines. Common audit event names remain;
metadata contains reviewed machine fields only, never part numbers, text or exact location.

## Search readiness and future scope

Catalog/spec/fitment/quantity are structured, explicitly owned and safely projected;
indexes support exact category/brand/number and fitment access. Shared root/location/media
make joint Cars + Parts discovery possible. Next stage should design **Geo/Search for both**
with product-specific filters and publication invariants, shared geo/cursor/map privacy,
then evaluate map UI. This stage adds no Parts spatial filters, advanced facets, free-text
search, saved notifications, recommendations or clustering.

Known limitations: manual whole-offer stock closure; seller-stated compatibility;
basic bounded offset discovery can shift between requests; category administration
and DB-trigger enforcement of complete subtypes/transitive cycles are absent. No price
conversion, delivery/orders/payments, external OEM integration or browser E2E framework.
