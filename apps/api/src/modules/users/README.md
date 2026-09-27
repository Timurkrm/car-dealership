# users

User profiles and account lifecycle; credentials belong to auth.

Owns `users` and `user_roles`. Email has one canonical normalized representation;
credentials remain in auth. Role assignments require future authorization/audit.
Exports transaction-aware UserIdentity for explicit private identity reads,
account locks, role lookup, pending account creation and verification fact updates.
Other modules must use this API instead of querying private users/roles tables.

See [the data model](../../../../../docs/data-model.md) for constraints, indexes,
privacy and deletion policies. Expose intentional APIs/types through index.ts;
other modules must not import internal files or query this module's tables.
