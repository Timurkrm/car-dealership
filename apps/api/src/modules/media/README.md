# media

Media ownership, metadata and processing; use the S3-compatible platform storage boundary.
See docs/media.md and ADR 0005. Seller mutations call ListingAccess; the composition
root wires the listing-owned MediaPort to the read adapter, avoiding module cycles.

Owns `listing_media`: storage keys, ordering, processing status and at most one
primary image per listing. Storage keys are private; binary media stays in S3.
Upload validation and retry-safe object cleanup are future application work.

See [the data model](../../../../../docs/data-model.md) for constraints, indexes,
privacy and deletion policies. Expose intentional APIs/types through index.ts;
other modules must not import internal files or query this module's tables.
