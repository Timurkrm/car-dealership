# geo

Location privacy and PostGIS spatial operations with bounded queries and SRID 4326.

Owns `listing_locations`: private Point 4326, optional independently supplied
public Point, city/region/country. Geometry and geography-expression GiST indexes
serve bounding-box, metre radius and nearest queries. A separate partial publicPoint
GiST serves viewport markers. SpatialSearchProjection exposes owner-approved
searchByViewport/searchNearby query contracts to Search; no competing public radius API.
ListingLocations exposes transaction-aware full replacement/removal and bounded
batch reads to Listings; only owner mode selects exact point. Public point never
falls back to the private point. Coordinate order is longitude, latitude.

See [the data model](../../../../../docs/data-model.md) for constraints, indexes,
privacy and deletion policies. Expose intentional APIs/types through index.ts;
other modules must not import internal files or query this module's tables.

Private point may filter/rank normal discovery internally; map viewport membership and
marker output use publicPoint only. Distance is publicly rounded to kilometre buckets.
Antimeridian envelopes split in two. See docs/search-and-geo.md for bounds and inference limits.
