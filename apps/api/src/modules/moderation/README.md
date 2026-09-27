# moderation

Moderation decisions and queues, distinct from administrative permissions.

Owns `reports` and `moderation_actions`. Concrete target FKs plus an exclusive
CHECK preserve referential integrity; history deletion is restricted. Moderator
permissions and full review workflows are not implemented.

See [the data model](../../../../../docs/data-model.md) for constraints, indexes,
privacy and deletion policies. Expose intentional APIs/types through index.ts;
other modules must not import internal files or query this module's tables.
