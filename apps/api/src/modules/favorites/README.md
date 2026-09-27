# favorites

User-owned saved listings with authorization and uniqueness guarantees.

Owns `favorites`: unique user/listing pairs with user/time cursor indexes.
No favorites HTTP endpoints are implemented.

See [the data model](../../../../../docs/data-model.md) for constraints, indexes,
privacy and deletion policies. Expose intentional APIs/types through index.ts;
other modules must not import internal files or query this module's tables.
