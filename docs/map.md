# Interactive marketplace map

## Overview

Cars and Parts share one MapLibre GL JS presentation layer and one server-assisted
PostGIS map projection. The public catalogs support `LIST`, `SPLIT` and `MAP` modes;
mobile exposes List and Map while the desktop default is Split. The list remains the
progressive fallback when WebGL, the style provider or tile delivery is unavailable.

MapLibre is loaded with a client-only dynamic import. A mounted map instance survives
filter, viewport and response changes. One GeoJSON source drives cluster and listing
layers, and a separate source draws the selected listing. The implementation does not
create a DOM marker per result.

## Backend map contract

`GET /api/v1/search/listings/map` accepts the same discriminated `type=VEHICLE|PART`
filters as list search plus:

- `viewport=west,south,east,north`: visible public map bounds; antimeridian crossing is
  represented by `west > east`;
- `zoom=0..22`: MapLibre zoom with at most two decimals; the integer bucket controls
  clustering;
- `limit=1..500`: bounded number of returned features, default 500.

`viewport` is a display projection and does not change the search geography. A request
may therefore combine it with private `bbox`, or with `lat`, `lng` and
`radiusMeters`. A lone `bbox` without `viewport` or origin remains a deprecated legacy
viewport alias and receives `Deprecation: true`.

The response is:

```json
{
  "features": [
    {
      "kind": "CLUSTER",
      "clusterId": "5:16:10",
      "center": { "latitude": 52.1, "longitude": 4.3 },
      "count": 42,
      "bounds": { "west": 4.1, "south": 52.0, "east": 4.5, "north": 52.2 }
    },
    {
      "kind": "LISTING",
      "listingId": "uuid",
      "type": "VEHICLE",
      "publicPoint": { "latitude": 52.2, "longitude": 4.4 },
      "title": "...",
      "price": { "amountMinor": "2500000", "currency": "EUR" },
      "cover": { "url": "...", "width": 320, "height": 240 },
      "location": {
        "city": "...",
        "region": null,
        "countryCode": "NL",
        "distanceMeters": null
      },
      "vehicle": {
        "make": "...",
        "model": "...",
        "year": 2022,
        "mileageKm": 15000
      }
    }
  ],
  "truncated": false,
  "limit": 500
}
```

Part listing features replace `vehicle` with name, category, nullable brand, condition
and a bounded fitment mode/count summary. The marker payload is sufficient for the
preview; marker clicks do not fetch the detail endpoint.

## Server-assisted clustering

Eligibility and all subtype filters run before aggregation. The query includes only
PUBLISHED, positive-price/stock, valid subtype rows with a READY primary image and all
required variants. Part compatibility remains a semijoin and does not multiply map
rows.

Public points are transformed to EPSG:3857 and assigned to a global deterministic
64-CSS-pixel grid based on the integer zoom bucket. Web Mercator latitude is clamped
only for projection. Each cell produces a count, mean projected center and bounds.
Cells with one row are resolved with one batched compact projection query; cells with
more than one row are returned as clusters without media projection. The request uses
one aggregation SELECT plus at most one singleton SELECT, independent of feature count.

Clustering before the 500-feature limit preserves density. Clustering an already
truncated marker set would falsely imply that omitted listings did not exist. If grid
cells still exceed 500, `truncated=true` explicitly reports that the viewport is only
partially represented. No persistent cluster entity, cache, materialized table or
vector-tile pipeline is introduced.

## Location privacy

`ListingLocation.point` remains private. Ordinary list bbox/radius/nearest filters may
use it internally, and distance remains a kilometre bucket. Map membership, listing
marker coordinates, cluster membership, center and bounds use only independently
provided `publicPoint`. There is no `publicPoint ?? point` fallback. Listings without a
public point remain in list/radius results but never become map features.

Browser Near Me is requested only after a user click. The exact browser origin lives in
React memory and is sent only to search APIs. It is not written to URL parameters,
local/session storage or logs. While this origin is active, camera coordinates are also
omitted from the URL. Manual map camera state uses four decimal places for latitude and
longitude and two for zoom.

## List and map synchronization

Both projections receive one canonical product filter object. `moveend` updates the
map viewport after 225 ms, aborts the previous request and uses an epoch check before
applying a response. Panning replaces coarse camera URL state without adding history
entries. It does not change `bbox`.

“Искать в этой области” promotes the current viewport to the search `bbox`, removes
radius/origin and distance sorting, clears cursor pagination and creates a navigation
entry. Selection is keyed by listing ID. Selecting a loaded card highlights its marker;
selecting a marker focuses a loaded card or shows the marker preview without loading
additional list pages.

## Provider and security configuration

`NEXT_PUBLIC_MAP_STYLE_URL` is a build-time public HTTP(S) MapLibre style URL.
`NEXT_PUBLIC_MAP_ATTRIBUTION` is optional plain text; provider/source attribution is
still shown by MapLibre. Neither variable may contain credentials. The UI shows a
recoverable map error and retains list navigation when configuration or provider
delivery fails.

Next.js sets a deployment CSP with no `unsafe-eval`, bounded API/style origins in
`connect-src`, `worker-src blob:` for MapLibre, frame denial and no-referrer. HTTPS
images/fonts remain allowed because private signed media and style resources can use a
provider origin. A custom style whose JSON references additional tile/font origins must
be reviewed against this header before deployment. Static Next.js hydration currently
requires `unsafe-inline` script/style; nonce-based CSP is tracked as a deployment
hardening limitation rather than silently disabling the map.

## Accessibility and responsive behavior

Mode controls expose pressed state, all actions are native keyboard controls, the map
has an explicit accessible label and count announcement, and MapLibre navigation
controls remain available. Individual map features are not emitted as hundreds of
screen-reader DOM nodes. Cluster fit/zoom honors `prefers-reduced-motion`.

At widths through 760 px the Split default renders as List, its Split control is hidden,
and Map is an explicit full-height mode with a compact bottom preview. Desktop Split
uses a 40/60-style grid and a sticky map.

## Performance and query plans

`npm run search:plans` creates an owned database with 55,003 listings, 165,000 media
variants, runs `ANALYZE`, and reviews list plus cluster SQL using
`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`. Selective Vehicle and Part viewport plans
must use `ix_listing_locations_public_point`. Broad world views may choose a sequential
location scan because most rows qualify; the output remains a small number of grid
cells and is bounded to 500.

The report is written to ignored `.tools/search-plan-report.json`. Timings are local
development measurements, not a production SLA. See `docs/search-and-geo.md` for the
latest measured table.

## Known limitations

There is no client or server tile cache, marker spiderfier, vector-tile path, heatmap,
offline map, geocoder, address autocomplete, persisted last camera, or client-side
clustering. Clusters do not span the ±180° Web Mercator seam; a crossing viewport can
show separate clusters on either side while remaining correct. Browser Playwright is
not installed, so automated coverage uses backend integration tests and frontend
state/parser/render tests; the manual checklist is `docs/map-qa.md`.
