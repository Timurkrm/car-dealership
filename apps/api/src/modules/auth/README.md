# auth

Authentication credentials and sessions. Authorization policies must be enforced on the backend.

Owns `user_credentials`, `user_sessions`, `session_tokens`, `auth_action_tokens`.
Credential/digests are excluded from ordinary selects. Implemented application
services own login, atomic rotation/replay revocation, recovery and cleanup;
HTTP transport owns validated DTOs, cookie scope, Origin, rate policies and guards.
EmailSender isolates post-commit delivery. Users' public identity API supplies
current account state/roles and user locks; audit joins the same transaction.
Exported authentication/RBAC guards and principal decorators form the boundary.
See [authentication](../../../../../docs/authentication.md) for flows and trade-offs.

See [the data model](../../../../../docs/data-model.md) for constraints, indexes,
privacy and deletion policies. Expose intentional APIs/types through index.ts;
other modules must not import internal files or query this module's tables.
