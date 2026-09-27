# notifications

Notification preferences and retry-safe delivery; add queues when delivery exists.

Owns `notifications`: private bounded event payload, type and read marker.
User/time and partial unread indexes prepare bounded lists. Delivery/queues are
not implemented.

See [the data model](../../../../../docs/data-model.md) for constraints, indexes,
privacy and deletion policies. Expose intentional APIs/types through index.ts;
other modules must not import internal files or query this module's tables.
