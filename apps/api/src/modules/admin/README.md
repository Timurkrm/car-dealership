# admin

Administrative operations using centralized permissions and audit records.

This module currently owns no additional tables or endpoints. Future administrative
operations use centralized permissions and the public audit append boundary.

See [the data model](../../../../../docs/data-model.md) for constraints, indexes,
privacy and deletion policies. Expose intentional APIs/types through index.ts;
other modules must not import internal files or query this module's tables.
