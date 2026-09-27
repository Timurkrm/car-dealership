# search

Public search orchestration and bounded pagination; PostgreSQL is authoritative.

Owns `saved_searches`: versioned bounded JSON filter objects and user preferences.
Canonical subtype/listing attributes remain relational. ListingSearch owns the single
public GET /listings?type=VEHICLE|PART discovery query, Search schema v2 filters,
encrypted keyset cursor,
separate bounded facets and server-clustered publicPoint map projection. Map viewport
is independent from private bbox/radius search geography and returns a bounded
LISTING/CLUSTER union. It composes owner-approved
Listings/Vehicle/Parts/Geo/Media read contracts, not private repositories/tables.
PostgreSQL/PostGIS remains authoritative; no secondary engine or result cache.
See [Search/Geo](../../../../../docs/search-and-geo.md) and ADR 0006.

See [the data model](../../../../../docs/data-model.md) for constraints, indexes,
privacy and deletion policies. Expose intentional APIs/types through index.ts;
other modules must not import internal files or query this module's tables.
