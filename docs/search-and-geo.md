# Search and Geo

## Overview

Search is one public application responsibility for both marketplace subtypes.
`GET /api/v1/listings?type=VEHICLE|PART` is the canonical collection endpoint.
Omitting `type` temporarily means `VEHICLE` for backward compatibility; `/cars` and
`/parts` always send it explicitly. There is no public `ALL` mode and no separate
Parts collection query.

The common orchestrator owns publication eligibility, money filters, PostGIS,
READY-primary media, stable sorting, encrypted cursors, response envelopes, bounds,
rate limiting and safe logging. A small subtype strategy selects the Vehicle or Part
owner projection and its facets. Listings, Vehicles, Parts, Geo and Media expose
application projection contracts through their module indexes; Search does not import
their persistence internals.

The internal filter model is the discriminated, serializable Search schema v2:

```text
{ schemaVersion: 2, type: VEHICLE, filters: VehicleFilters, spatial, sort }
{ schemaVersion: 2, type: PART, filters: PartFilters, spatial, sort }
```

It is the canonical model intended for a future SavedSearch adapter. Existing saved
JSON is not migrated or executed in this stage.

Search returns only `PUBLISHED` roots with a valid subtype, positive supported-currency
price, nonblank description and a READY primary image with all required variants.
Malformed legacy subtype/media/catalog rows are filtered rather than failing a page.
Part offers also require quantity greater than zero, an active category, an active
brand when one is present, and at least one fitment when vehicle-specific.

## Source of truth

PostgreSQL/PostGIS is authoritative. Redis only enforces existing request limits and
object storage signs fresh thumbnail URLs. Search does not use OpenSearch, a shadow
document, result cache, long transaction, exact total, or offset. Read queries are
stateless and can later move to a replica after a replication-lag policy is defined.

## Search filters

Common parameters:

| Parameter                        | Policy                                                   |
| -------------------------------- | -------------------------------------------------------- |
| `type`                           | `VEHICLE` or `PART`; omitted means `VEHICLE` temporarily |
| `priceFromMinor`, `priceToMinor` | inclusive canonical int64 strings; require `currency`    |
| `currency`                       | existing listing currency allowlist; no conversion       |
| `bbox`                           | `west,south,east,north`; conflicts with origin/radius    |
| `lat`, `lng`, `radiusMeters`     | complete origin; radius 1–250000 m                       |
| `sort`                           | subtype allowlist below                                  |
| `limit`                          | list default 20/max 50; map default/max 500 features     |
| `cursor`                         | list only; opaque authenticated continuation             |

Vehicle-only filters are `makeId`, `modelId`, `generationId`, inclusive
`yearFrom/yearTo`, inclusive `mileageFrom/mileageTo`, and comma-separated canonical
`bodyType`, `fuelType`, `transmission`, `driveType`, `condition`, and `color`.
Multi-value fields accept at most eight unique values.

Part-only filters:

| Parameter                | Policy                                                             |
| ------------------------ | ------------------------------------------------------------------ |
| `categoryId`             | catalog UUID; selected category plus active descendants by default |
| `includeSubcategories`   | boolean, default `true`; `false` selects exact category            |
| `brandId`                | active Part brand UUID                                             |
| `condition`              | comma-separated NEW, USED, REFURBISHED, FOR_PARTS                  |
| `oemNumber`              | exact Parts-domain-normalized OEM value                            |
| `manufacturerPartNumber` | exact Parts-domain-normalized manufacturer value                   |
| `partNumber`             | exact convenience match against OEM or manufacturer value          |
| `compatibleMakeId`       | fitment model belongs to make                                      |
| `compatibleModelId`      | exact fitment model                                                |
| `compatibleGenerationId` | requires model; exact or null-generation all-generations fitment   |
| `compatibleYear`         | 1886–2100, checked against nullable inclusive fitment bounds       |
| `fitmentMode`            | comma-separated UNIVERSAL and/or VEHICLE_SPECIFIC                  |
| `includeUniversal`       | compatibility queries include universal parts by default           |

Part number normalization reuses `normalizePartNumber`: trim, uppercase, separators
preserved, maximum 100 characters, no fuzzy/substring matching. Compatibility uses a
semijoin against the bounded fitment subquery, so multiple matches never duplicate a
listing and PostgreSQL can start from selective compatibility predicates.
Generation-null means every generation of the selected model within optional year
bounds. Category traversal is one bounded recursive CTE (maximum 32 levels) with a
visited UUID path, so corrupt cycles cannot hang a request.

Cross-subtype parameters return `SEARCH_FILTER_NOT_SUPPORTED`. Vehicle-only
`mileage_asc`/`year_desc` sorts on Parts return `SEARCH_SORT_NOT_SUPPORTED`. Other
codes include `SEARCH_INVALID_FILTER`, `VALIDATION_ERROR` with
`SEARCH_INVALID_RANGE`, `SEARCH_INVALID_SORT`, `SEARCH_INVALID_CURSOR`,
`SEARCH_CURSOR_QUERY_MISMATCH`, `SEARCH_LOCATION_REQUIRED`,
`GEO_INVALID_COORDINATES`, `GEO_INVALID_BBOX`, `GEO_INVALID_RADIUS`, and
`GEO_CONFLICTING_FILTERS`. Values are bound parameters; sort SQL uses a fixed allowlist.

## Sorting

Every order is deterministic:

| Sort          | Types        | Order                                                  |
| ------------- | ------------ | ------------------------------------------------------ |
| `newest`      | both         | publishedAt DESC, UUID DESC                            |
| `price_asc`   | both         | priceMinor ASC, publishedAt DESC, UUID DESC            |
| `price_desc`  | both         | priceMinor DESC, publishedAt DESC, UUID DESC           |
| `distance`    | both         | private geography KNN ASC, publishedAt DESC, UUID DESC |
| `mileage_asc` | VEHICLE only | mileageKm ASC, publishedAt DESC, UUID DESC             |
| `year_desc`   | VEHICLE only | year DESC, publishedAt DESC, UUID DESC                 |

Price sorting requires a currency. Distance requires an origin and never falls back.

## Pagination

The response is `{items, page:{hasNextPage,nextCursor}}`. The query fetches `limit+1`;
there is no default `COUNT(*)` and no canonical `OFFSET`.

Cursor envelope `1.<base64url>` contains AES-256-GCM ciphertext with a random 96-bit IV,
authentication tag, versioned AAD and a key derived through HKDF from the configured
auth secret. Its authenticated payload contains cursor version, 24-hour expiry, Search
schema v2 fingerprint, sort value, publication timestamp and UUID. The fingerprint
contains `type`, canonical subtype filters, geo context and sort; it excludes cursor,
limit and request ID. Reusing a cursor with another subtype or filter set returns
`SEARCH_CURSOR_QUERY_MISMATCH`.

Pagination is a live traversal, not a multi-request snapshot. New rows before the
cursor do not duplicate later pages; rows can disappear after SOLD/archive.

## Geo modes

Exactly one spatial mode is allowed:

- no geo: Parts without `ListingLocation` remain visible;
- viewport bbox: inclusive `ST_Intersects`, including antimeridian split;
- origin: optional indexed radius plus database-calculated distance/nearest order.

Longitude is -180..180, latitude -90..90, south must not exceed north, and inputs have
at most eight fractional digits. `west > east` means an antimeridian-crossing viewport
and becomes two envelopes. Degenerate point/line viewports are handled explicitly.
World-size bbox remains valid because list/map output is bounded.

Origin radius uses
`ST_DWithin(point::geography, origin::geography, radius, false)`. Nearest uses
geography `<->`; distance is calculated in PostgreSQL. Listings without a location do
not match geo filters. No Node.js Haversine scan exists.

## PostGIS

- `ST_Intersects` + `ST_MakeEnvelope` for normal bbox;
- two envelopes joined with OR for antimeridian bbox;
- `ST_MakePoint`/`ST_MakeLine` for zero-area viewports;
- `ST_DWithin(...::geography, ..., false)` for metre-radius filtering;
- geography `<->` for KNN order.

The existing exact geometry GiST, exact geography expression GiST and partial public
point GiST serve both subtypes because `ListingLocation` belongs to the common Listing.

## Exact vs public location

`ListingLocation.point` is private. Search may use it for bbox/radius/nearest filtering
and ordering, but it is never selected into a public DTO or log.
`ListingLocation.publicPoint` is independently supplied and nullable. Public projection
uses only `ST_X/ST_Y(publicPoint)` and never `publicPoint ?? point`.

An exact-only listing can match radius/nearest and its result has
`location.publicPoint = null`. A Part without any location remains in ordinary search
with `location = null`. Map membership and marker position both use publicPoint, so
neither row produces a marker.

## Distance privacy

Raw database distance is used only for ranking and the encrypted cursor. Anonymous
responses expose `null` without origin, `0` for less than one kilometre, otherwise the
nearest whole kilometre in metres. The UI renders `< 1 км`, `1 км`, `12 км`. Logs omit
coordinates, bbox values, query strings and cursor contents.

## Result contract

List items share id, type, title, price, publishedAt, READY primary thumbnail and
nullable public location. The discriminated payload is:

- VEHICLE: make/model/generation, year, mileage and canonical specification enums;
- PART: name, category, nullable brand, condition, public numbers, available quantity,
  fitment mode/count and at most three representative compatibility rows.

No list item contains VIN, private point, seller identity/contact, gallery, storage key,
audit/moderation data, optimistic version or full fitment collection.

## Map API

`GET /api/v1/search/listings/map?type=...&viewport=...&zoom=...` uses the same filters
and eligibility, then clusters eligible public points before its 500-feature cap. It
returns `{features,truncated,limit}` as a `LISTING | CLUSTER` union. A cluster contains
an ephemeral grid ID, count, center and bounds; a listing contains one primary thumbnail
and the subtype preview required by Map UI. Only nonnull publicPoint rows participate.

`viewport` is independent from actual search geography. It may be combined with a
private-point `bbox` or radius origin, so map movement only changes display projection.
A lone legacy `bbox` remains a deprecated viewport alias. Server grid clustering is
global, deterministic, Web Mercator-based and equivalent to 64 CSS pixels at the
integer zoom bucket. Cluster membership, center and bounds use publicPoint only. See
[map.md](map.md) and ADR 0008.

## Facets

`GET /api/v1/search/listings/facets?type=...` is explicit and separately rate-limited.
Counts use all current filters, including a selected facet itself.

- VEHICLE: make, bodyType, fuelType, transmission;
- PART: category UUID, brand UUID, condition.

One subtype-specific `GROUPING SETS` query returns at most 100 total buckets with
deterministic ties and `truncated`. The Parts frontend resolves UUID buckets through
the bounded catalogs. Facets are not added to every list response.

## Index strategy

| Index                                                          | Pattern                                    |
| -------------------------------------------------------------- | ------------------------------------------ |
| `ix_listings_published_newest` partial                         | both subtype newest traversal              |
| `ix_listings_published_price` partial                          | both subtype price filter/order            |
| vehicle link PK and `ix_vehicles_model_year`                   | Vehicle joins/model/year                   |
| `ix_parts_category`                                            | Part category candidates                   |
| partial `ix_parts_brand`                                       | Part brand candidates                      |
| partial `ix_parts_oem_number`                                  | exact OEM                                  |
| partial `ix_parts_manufacturer_number`                         | exact manufacturer number                  |
| `ix_part_fitments_model_generation` and unique selection index | fitment semijoin and publication invariant |
| `ix_listing_locations_point` GiST                              | private bbox                               |
| `ix_listing_locations_geography` GiST expression               | radius and nearest                         |
| `ix_listing_locations_public_point` partial GiST               | map viewport                               |
| READY primary unique/media variant keys                        | one cover, no gallery join                 |

The 55k-row plan review did not justify another migration. Publication-first scans stop
quickly for newest/category/brand pages; exact number and common spatial indexes are
selected. Low-cardinality condition/fitmentMode indexes and overlapping subtype-specific
publication composites were intentionally not added. Category and compatibility plans
should be rechecked with real distributions and deeper pages.

## Query plans

`npm run search:plans` creates and drops an owned isolated database, clean-applies
migrations, generates 30,000 Vehicles and 25,000 Parts with varied category, brand,
condition, numbers, universal/specific fitment, status, media and location state, runs
`ANALYZE`, then executes production projection SQL with
`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`.

Reviewed local development dataset: 55,003 listings, 30,003 vehicle records, 25,000
parts, 38,753 PUBLISHED roots and 165,000 media variants. The 2026-09-20 run selected:

| Pattern                        | Main evidence                       | Execution ms |
| ------------------------------ | ----------------------------------- | -----------: |
| Vehicle newest                 | published-newest index              |        3.507 |
| Vehicle model/year/price       | model/year index + bounded sort     |       34.773 |
| Vehicle price asc              | published-price + incremental sort  |        0.882 |
| Vehicle bbox                   | exact point GiST                    |        5.876 |
| Vehicle radius                 | geography GiST                      |       12.658 |
| Vehicle nearest                | ordered geography GiST KNN          |        1.104 |
| Vehicle map, zoom 15           | publicPoint GiST, 63 features       |        6.753 |
| Vehicle map, zoom 5            | publicPoint GiST, 1 cluster         |        4.728 |
| Vehicle map, world zoom 2      | broad aggregate scan, 1 cluster     |      245.054 |
| Part newest                    | published-newest index              |        0.725 |
| Part category/condition/price  | bounded publication-first scan      |        1.926 |
| Part brand                     | publication-first indexed joins     |        1.021 |
| Part exact OEM                 | `ix_parts_oem_number`               |        0.204 |
| Part exact manufacturer number | `ix_parts_manufacturer_number`      |        0.202 |
| Part compatibility             | bounded fitment semijoin            |       34.023 |
| Part radius                    | geography GiST                      |        4.759 |
| Part nearest                   | ordered geography GiST KNN          |        1.197 |
| Part map, zoom 15              | publicPoint GiST, 55 features       |        4.598 |
| Part compat map, world zoom 2  | broad filtered aggregate, 1 cluster |      169.169 |

These are local development observations, not production latency guarantees. Planning,
container cache and data correlation affect each run. Detailed nodes and indexes are
written to ignored `.tools/search-plan-report.json`.

Vehicle list uses one SELECT. Part list uses one search SELECT plus a fixed set of
bounded batch projection queries for compatibility names/samples. Instrumentation
verifies page limits 1 and 50 use the same SELECT count; it does not grow per item.
Map clustering uses one aggregate SELECT and, only when singleton cells exist, one
batched preview SELECT. Cluster-only low-zoom responses use one SELECT.

## Caching

No list, arbitrary geo or facets result cache is introduced. Their cardinality and
publication/price/SOLD invalidation cost do not justify it. PostgreSQL changes are
observed immediately and every fetch receives fresh short-lived media URLs.

## Observability and abuse bounds

Safe completion logs contain operation, low-cardinality listing type, duration,
filter count, result count, sort and geo mode. They never include user IDs, numbers,
coordinates, query strings or cursors. The existing 500 ms slow-search warning remains.
There is no metrics exporter to extend in this repository.

Redis policies remain: ordinary search 180/minute, geo/map 60/minute, facets
20/minute. Limits, multi-select counts, number length, radius, cursor length, map
markers and facet buckets are bounded. The existing PostgreSQL statement timeout is
3 seconds; public search opens no long read transaction.

## Future OpenSearch

A secondary index may become useful for measured needs such as complex free text, typo
tolerance, heavy faceting, sophisticated ranking or sustained QPS beyond PostgreSQL
capacity. It would remain derived from PostgreSQL and implement the existing Search
contract with explicit lag/reconciliation. It is not assumed to be inevitable.

## Known limitations

There is no free text/fuzzy number search, geocoder, address autocomplete, `ALL` query,
saved-search API/notifications, personalization, promotion, currency conversion,
vector tiles, heatmaps or offline maps. Compatibility is seller-stated. Category
traversal is bounded at 32 levels. Exact membership can still support inference despite
rounded output. Browser Playwright is not installed; frontend map state, cancellation,
runtime DTO parsing and rendering behavior use Node tests plus the manual QA checklist.

The next stage is Moderation/Admin for Cars + Parts: moderation queue,
approve/reject, reports, blocking, audit and admin panel.
