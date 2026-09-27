# Parts

Owns Part specifications, database-backed category/brand references and seller-provided
vehicle fitments. Listings owns the shared marketplace root and subtype offer links,
quantity, ownership, money, version and lifecycle. Calls Vehicles only through its
catalog application contract. Media/location/history remain attached to Listing.id.
Public entry point is index.ts; no warehouse, shipping or external OEM integration.
PartSearchProjection owns category subtree, exact number and fitment EXISTS semantics;
the Search module owns the common public cursor/geo/media contract.
