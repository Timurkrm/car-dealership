# messaging

Private conversations and messages with participant authorization and pagination.

Owns `conversations`, `conversation_participants` and `messages`. A composite FK
enforces sender membership; private bodies require explicit selection. Time/UUID
cursors support history pagination. Permissions and transport are future work.

See [the data model](../../../../../docs/data-model.md) for constraints, indexes,
privacy and deletion policies. Expose intentional APIs/types through index.ts;
other modules must not import internal files or query this module's tables.
