# ADR 0006: PostgreSQL/PostGIS discovery and public location boundary

- Status: Accepted
- Date: 2026-09-19

## Context

Marketplace persistence, lifecycle, private/public locations and processed primary
photos exist. Discovery needs structured filters, stable continuation and spatial
search without a competing API, cross-module table access or private-coordinate leaks.
No workload evidence justifies a separate search engine or geo-result cache.

## Decision

Route the existing public GET /listings through the Search application responsibility.
The same endpoint now requires a discriminated VEHICLE/PART query model; an omitted
type temporarily means VEHICLE for compatibility. One common orchestrator owns cursor,
geo, media, eligibility, bounds and response envelopes, while owner-approved subtype
strategies contribute their filters/projections/facets. There is no cross-category ALL
mode and the former Parts offset collection route is removed.
Use explicit owner-approved projection contracts for one bounded PostgreSQL read.
Keep versioned canonical filters and keyset sorting with publication/UUID ties.
Encrypt/authenticate 24-hour continuation cursors and bind their query fingerprint;
this also conceals precise private geography distance values.

Use exact points internally for spatial list filtering and spherical geography KNN
ranking, indexed ST_DWithin with the same sphere radius semantics. Public DTOs expose
only independently supplied publicPoint and kilometre distance buckets. Map viewport
membership and marker coordinates both use publicPoint, backed by a separate partial
GiST verified on 30003 rows. Exact-only rows remain searchable but have no marker.
Facets aggregate after all filters, separately requested/rate-limited and bounded.
Part category descendants use a bounded cycle-safe recursive CTE; part numbers remain
exact under the Parts domain normalization; compatibility uses a selective semijoin. Search schema v2
and its cursor fingerprint include the listing type and subtype filter model.

## Alternatives

- Another GET /search/listings alongside an independent public list: competing semantics.
- Offset pagination: grows with traversal depth and shifts under new publications.
- Plain/signed base64 cursors: can disclose raw distance, despite a safe response DTO.
- Geometry-degree nearest ordering: inconsistent metre meaning at different latitudes.
- Spheroid filtering with spherical KNN: creates different distance boundary semantics.
- Public fallback to exact point: breaks the existing explicit location privacy boundary.
- OpenSearch/result caches now: add lag/invalidation/operations without demonstrated need.
- Independent Parts search SQL: would duplicate pagination, privacy and geo behavior.
- A polymorphic all-category result: has no current product requirement and complicates
  ranking/faceting semantics.

## Consequences

The monolith remains simple and source-of-truth reads observe lifecycle changes directly.
Owner projections preserve boundaries without duplicate entity graphs or per-card reads.
Parts without a location stay visible in ordinary results; geo queries exclude them.
Replica/secondary search implementation can later preserve the HTTP contract. Cursors
depend on a shared derived key; secret rotation invalidates them. Paging is a live
traversal, not a multi-request snapshot. Map responses explicitly signal truncation.
Rounded distances reduce direct disclosure but exact membership still allows inference
through repeated requests; stronger privacy would require a changed internal policy.
Global facet aggregation and deep/very selective nearest traversals still need workload
review. The new public spatial index incurs write/storage and deployment DDL lock cost.
No map UI, clustering, geocoder or notifications are implemented in this decision.
