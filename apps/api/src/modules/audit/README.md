# audit

Append-only records of security-sensitive operations with privacy-safe context.

Owns `audit_logs` and exposes `AuditWriter.append()` with allowlisted machine
metadata and optional caller transaction context. History survives actor deletion.
Append orientation does not substitute for restricted production DB privileges.

See [the data model](../../../../../docs/data-model.md) for constraints, indexes,
privacy and deletion policies. Expose intentional APIs/types through index.ts;
other modules must not import internal files or query this module's tables.
