# ADR 0008: Server-assisted public-point map clustering

- Status: Accepted
- Date: 2026-09-20

## Context

The unified Cars/Parts map endpoint returned at most 500 individual public markers.
Clustering that truncated set in a browser would produce a visually plausible but false
view of density. Sending every matching point is unbounded, exposes more location data,
and moves filtering cost out of authoritative PostgreSQL. The product needs an
interactive MapLibre map now, without committing to a vector-tile service or separate
search engine.

## Decision

Keep PostgreSQL/PostGIS authoritative and cluster map-eligible `publicPoint` rows before
the response limit. Use a deterministic global EPSG:3857 grid equivalent to 64 CSS
pixels at the integer MapLibre zoom. Return a discriminated `LISTING | CLUSTER` domain
DTO, cluster bounds and explicit truncation. A query uses one aggregation SELECT and at
most one batch SELECT for singleton previews.

Treat the visible public `viewport` independently from exact-point search `bbox` or
radius. Map movement changes only viewport/camera; the user explicitly promotes a
viewport to a search bbox. Cars and Parts share one MapLibre component and GeoJSON
layer model but retain explicit subtype filters and previews.

Use exact point only for existing internal list/radius/nearest semantics. Map
membership, marker coordinates, cluster membership, center and bounds use publicPoint
without fallback. Browser Near Me origin is session memory and is excluded from URL,
storage and ordinary logs.

## Alternatives

- Client clustering of the first 500 markers: rejected because omitted matches make
  cluster counts and coverage false.
- Return every point: rejected as unbounded and privacy-heavy.
- Persistent cluster tables: rejected because publication, price, stock and arbitrary
  filters make invalidation complex.
- Vector tiles now: useful at much larger measured map load, but adds a new delivery and
  caching architecture without current evidence.
- Provider-specific clustering: couples source-of-truth filtering and privacy policy to
  an external map provider.

## Consequences

Low zoom responses represent density with few features; high zoom resolves individual
preview markers. The existing partial publicPoint GiST serves selective viewports, so no
schema migration is required. Broad views intentionally scan qualifying published rows
and aggregate them; rate limiting, a 500-feature cap and the existing statement timeout
bound abuse. Grid clusters are ephemeral and can change with zoom or current data.
Cells on opposite sides of the antimeridian remain separate. If measured scale later
requires vector tiles, the HTTP/client domain union and exact/public privacy boundary
can remain while the projection implementation changes.
