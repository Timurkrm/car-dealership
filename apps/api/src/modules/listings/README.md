# listings

Listing ownership, publication lifecycle, prices and seller-visible listings.

Owns `listings`, `vehicle_listings`, `part_listings`: seller, price/currency, publication lifecycle and version.
Commands implement draft/edit/submit/archive/sold with owner-scoped locks and
atomic version/status CAS, plus vehicle/part/fitment/location/audit in one transaction.
Queries use bounded batch APIs and explicit public/owner mappings. If-Match is
mandatory for mutations; plain save/VersionColumn is not concurrency protection.
See [listing workflows](../../../../../docs/listings.md) and [Parts](../../../../../docs/parts.md), ADR 0004/0007.

See [the data model](../../../../../docs/data-model.md) for constraints, indexes,
privacy and deletion policies. Expose intentional APIs/types through index.ts;
other modules must not import internal files or query this module's tables.
