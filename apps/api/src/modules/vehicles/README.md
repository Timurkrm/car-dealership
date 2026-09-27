# vehicles

Vehicle specifications and reference data; publication state belongs to listings.

Owns `vehicle_makes`, `vehicle_models`, `vehicle_generations` and `vehicles`.
Generation/model integrity is enforced by a composite FK. VIN is private and not
globally unique. The development catalog seed is separate from migrations.
Catalog exposes bounded read-only Make/Model/Generation REST routes.
VehicleRecords exports explicit transaction-aware creation and batch projections.
Specification edits through Listings create a new immutable observation; there
is no public arbitrary vehicle CRUD. See ADR 0004 and docs/listings.md.

See [the data model](../../../../../docs/data-model.md) for constraints, indexes,
privacy and deletion policies. Expose intentional APIs/types through index.ts;
other modules must not import internal files or query this module's tables.
