# Browser authentication

## Architecture

Next.js serves the browser and proxies `/api/v1/*` to the configured server-only
`API_URL`. Deploy web and API behind the same HTTPS origin. The Nest modular
monolith owns authentication; PostgreSQL owns credentials, account state, roles,
sessions and action tokens. Redis holds disposable rate counters only.

The browser keeps a short-lived access JWT in an `AuthClient` instance. A random
refresh credential is transported exclusively in an HttpOnly cookie. Bootstrap
performs refresh followed by `/auth/me`. Neither credential uses localStorage,
sessionStorage, IndexedDB, a URL, a frontend persisted store or application logs.
Recovery links use URL **fragments**, removed by the page before submission; the
API receives the action credential in a validated JSON body. Confirmation needs
a deliberate button click; opening the email link does not consume it.

`AuthProvider` exposes loading/anonymous/authenticated/unavailable states; account
content stays hidden until bootstrap succeeds. `AuthClient` centralizes JSON,
credential handling, errors, cancellation for action requests and one bounded
401 retry. Concurrent refreshes share a promise. Browser Web Locks serialize
refresh between same-origin tabs when available. A changed in-memory credential
also prevents a delayed 401 from starting another rotation unnecessarily.

## Credentials

Access is HS256 via `jose`, default 600 seconds, configurable 300–900 seconds.
Claims: `sub`, `sid`, `roles`, `iat`, `exp`, issuer `vehicle-marketplace`, audience
`marketplace-web`; header `typ=at+jwt`, configured `kid`. Verification restricts
algorithm, issuer, audience, type, key ID, UUID principals and lifetime, with five
seconds clock tolerance. No email/profile/password fields are included.

`AUTH_ACCESS_TOKEN_SECRET` must be a cryptographically generated 32-byte key,
encoded as 64 lowercase hex characters; a format/diversity check cannot prove
entropy. Obtain production keys from a secret manager. `env:init` generates local
keys without printing them. For planned rotation, deploy a fresh current secret
and key ID to all replicas with the former pair in
`AUTH_PREVIOUS_ACCESS_TOKEN_SECRET` / `AUTH_PREVIOUS_ACCESS_KEY_ID`. After the
maximum old access lifetime plus clock tolerance, remove the previous pair.
Compromise response removes the old key immediately and revokes affected sessions.
Keep clocks synchronized. JWT signing keys never leave the API.

Refresh/action credentials contain 32 CSPRNG bytes encoded as 43 base64url
characters. Store only SHA-256 of `purpose:credential`: a high-entropy random
credential does not need an expensive password KDF. Purpose separation prevents
verification/reset/refresh substitution. Digest columns are excluded from ordinary
ORM selects; authentication persistence explicitly selects them when necessary.

## Session model

`user_sessions.id` is the family ID. Refresh creates a new `session_tokens` row
within that family, never a new logical session. Multiple devices can sign in
independently. Default absolute lifetime: 30 days (configurable 1 hour–90 days).
Idle lifetime: seven days, checked against `last_used_at`/creation, updated only
on successful refresh. Replacement credentials retain the original absolute
deadline. A partial unique index enforces one unconsumed/unrevoked credential per
session. Consumed digests remain available through family expiry and cleanup.
No IP, user-agent fingerprint or precise location is stored in sessions.

Every protected request checks signature, persisted session ownership/revocation/
expiry, current account state and current persisted roles. This costs three
bounded indexed reads; it gives immediate revocation/status/role enforcement
without an access-token blacklist or security cache. Bearer validity alone never
authorizes a resource. Future resource endpoints must also enforce ownership.
Concurrent status changes take effect on subsequent requests; sensitive auth
mutations recheck identity/session inside their transaction.

## Endpoints

All paths below start with `/api/v1/auth`. POST requires exact `Origin: WEB_URL`.
Requests/credentials/responses use `Cache-Control: no-store`.

| Method/path                        | Input                                | Result                                                                                                           |
| ---------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| POST `/register`                   | email, displayName, password         | 201 message; pending account, USER role, credential, verification token and audit in one transaction; no session |
| POST `/login`                      | email, password                      | 200 accessToken/expiresIn and refresh cookie                                                                     |
| POST `/refresh`                    | empty body; refresh cookie           | 200 new accessToken/expiresIn and replacement cookie                                                             |
| POST `/logout`                     | empty body; optional refresh cookie  | idempotent 204; revoke cookie family and clear cookie                                                            |
| POST `/logout-all`                 | empty body; Bearer                   | 204; revoke all families including current; clear cookie                                                         |
| GET `/me`                          | Bearer                               | 200 id, displayName, email, roles, status, emailVerifiedAt                                                       |
| POST `/email-verification/request` | email                                | generic 202 for eligible/ineligible/unknown accounts                                                             |
| POST `/email-verification/confirm` | token                                | 204; single-use verification                                                                                     |
| POST `/password/forgot`            | email                                | generic 202 for eligible/ineligible/unknown accounts                                                             |
| POST `/password/reset`             | token, newPassword                   | 204; replace hash, consume token, revoke every family                                                            |
| POST `/password/change`            | currentPassword, newPassword; Bearer | 204; keep current family, revoke all others and unused reset links                                               |

DTOs reject unexpected fields and non-string credentials, bound email/name/
password/token input, and expose no ORM objects. API accepts ASCII email addresses
(including explicit punycode domains), normalized by Users' single trim/lowercase
function; internationalized local parts are intentionally unsupported. Display
names support Unicode, reject controls and have 1–100 characters. Passwords are
not trimmed, normalized or truncated. Refresh body/query credentials are rejected.

Ordinary error format remains `{statusCode, code, message, details, requestId}`.
Codes include `VALIDATION_ERROR`, `PASSWORD_POLICY_VIOLATION`,
`EMAIL_ALREADY_REGISTERED`, `INVALID_CREDENTIALS`, `AUTHENTICATION_REQUIRED`,
`EMAIL_VERIFICATION_REQUIRED`, `ACCOUNT_BLOCKED`, `ACCOUNT_SUSPENDED`,
`INVALID_REFRESH_TOKEN`, `REFRESH_TOKEN_REUSED`, `SESSION_REVOKED`,
`SESSION_EXPIRED`, `FORBIDDEN`, `ORIGIN_NOT_ALLOWED`, invalid/expired purpose-specific
action token codes, `INVALID_CURRENT_PASSWORD`, `PASSWORD_UNCHANGED`,
`AUTH_RATE_LIMITED`, `AUTH_RATE_LIMIT_UNAVAILABLE` and `AUTH_BUSY`.
Validation details contain field/rule names, never submitted credential values.
Swagger describes actual inputs, safe responses and cookie/Bearer security.

## Login

Unknown accounts and incorrect passwords use the same 401 body and anonymous
failed-login audit. Unknown accounts still run Argon2 verification against a
dummy hash. This reduces a large timing difference; database/network work is not
claimed constant-time. Status errors are exposed only after password proof.
Before creating a session, the transaction locks the user and rereads the hash,
so a concurrent password reset cannot authenticate an obsolete password.

```mermaid
sequenceDiagram
  participant Browser
  participant API
  participant PostgreSQL
  Browser->>API: POST login (Origin, email, password)
  API->>API: Origin, Redis policy, DTO validation
  API->>PostgreSQL: Explicit identity + credential read
  API->>API: Argon2id verification / optional rehash
  API->>PostgreSQL: BEGIN; lock user; reread hash/status
  API->>PostgreSQL: Insert session, refresh digest, audit
  API->>PostgreSQL: COMMIT
  API-->>Browser: access JWT + HttpOnly refresh cookie
  Browser->>API: GET me (Bearer JWT)
  API->>PostgreSQL: Current account, session and roles
  API-->>Browser: Allowlisted identity
```

## Refresh rotation

Digest lookup locates the family; inside the transaction lock ordering is user →
session → token. The user lock is also acquired by password change/reset,
logout/logout-all and verification. Recheck ownership, account status, expiry,
consumption and revocation. Consume A, update idle activity, insert B, read current
roles, sign access and append audit. Cookie changes happen only after commit.

```mermaid
sequenceDiagram
  participant Browser
  participant API
  participant PostgreSQL
  Browser->>API: POST refresh (Origin, cookie A)
  API->>PostgreSQL: Locate digest A; BEGIN
  API->>PostgreSQL: Lock user → session → token A
  API->>API: Check current status + idle/absolute deadlines
  API->>PostgreSQL: Consume A; insert digest B in same session
  API->>PostgreSQL: Read current roles; append refresh audit
  API->>PostgreSQL: COMMIT
  API-->>Browser: New access JWT + cookie B
```

## Reuse detection

Replaying a consumed digest in an unrevoked family revokes the session and every
family token and appends `AUTH_REFRESH_REUSE_DETECTED`. The transaction returns a
failure result so revocation **commits before** the 401 exception is thrown.
The replacement's access and refresh are then rejected. Other devices remain
independent. Replaying an already revoked family does not flood duplicate audits.

```mermaid
sequenceDiagram
  participant Browser
  participant API
  participant PostgreSQL
  Browser->>API: POST refresh (old cookie A after A→B)
  API->>PostgreSQL: BEGIN; lock user → session → A
  PostgreSQL-->>API: A is consumed
  API->>PostgreSQL: Revoke family and all tokens including B
  API->>PostgreSQL: Append reuse detection audit; COMMIT
  API-->>Browser: 401 REFRESH_TOKEN_REUSED + clear cookie
  Browser->>API: Attempt access/refresh from B
  API-->>Browser: 401 SESSION_REVOKED
```

There is no grace period for a consumed credential. Concurrent identical
refreshes yield one success and one replay rejection; the entire family is then
revoked, preventing two valid branches. Single-flight/Web Locks reduce benign
browser races. Without Web Locks, across other clients, or after an ambiguous
network failure, strict replay handling can require signing in again. Never
automatically replay a refresh POST after a transport timeout.

## Logout

Cookie logout is idempotent for missing/invalid/previously revoked credentials.
A retained digest identifies the same family even after rotation. Logout-all
needs valid current Bearer authentication and revokes all devices. Existing access
JWTs fail on the next protected request. Cookie clearing uses exactly the same
name/path/HttpOnly/Secure/SameSite attributes and an expired timestamp. No permanent
account lock is introduced.

## Password hashing

`PasswordHasher` centralizes Argon2id: 64 MiB memory, three iterations, parallelism
one, 32-byte output and independent random salts. This exceeds the minimum in
[OWASP's password storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
Policy: 15–128 Unicode code points, at most 1024 UTF-8 bytes, without character-class
rules. DTOs bound transport strings before native work. At most four expensive
password operations run concurrently per API instance; overload returns 503.
Cost increases use `needsRehash` on successful login; hash work runs before locks
and rehash applies only if the locked credential is still the one verified.
Benchmark costs and instance memory under actual production load before rollout.

Pinned `argon2` includes prebuilt Node-API binaries for supported Windows/Linux
targets. Its installation script is deliberately disabled in npm `allowScripts`;
unit tests execute the native hash/verify path. Unsupported platforms need an
explicit reviewed native-build setup. The current CI target is Linux x64.

## Email verification

`email_verified_at` is a separate nullable fact. Registration creates
`PENDING_VERIFICATION`, no session. Verification links expire after 24 hours by
default. Requesting a replacement revokes the previous unused link for that
purpose. Confirmation locks the user/token, consumes the digest, sets the fact,
activates a pending account and audits atomically. Replays, wrong purposes,
expired/revoked links and blocked/suspended accounts are rejected. Confirming
email does not grant administrative roles or create a login session.

Legacy ACTIVE accounts with no verification fact cannot authenticate. This
migration does not invent evidence of verification. Existing records need a
reviewed reconciliation; normal verification requests are for pending accounts.
Do not silently backfill verified timestamps from ACTIVE status.

## Password reset

Forgot uses a generic response for unknown/ineligible/eligible accounts and
anonymous request audits. Tokens expire after 30 minutes by default. Requesting
another token revokes the previous unused recovery link. Reset locks user/token,
changes the hash, consumes the recovery digest and revokes all sessions/token
families in one transaction. Replay fails. It does not verify email or sign in.
Password change proves the current password and rechecks it under the user lock;
equal passwords are rejected, the current family remains, other families and
outstanding recovery links are revoked.

## Email delivery

`EmailSender` isolates delivery. In development/test, `PreviewEmailSender` retains
a bounded set of messages in ephemeral process memory; it sends no real mail,
prints no credentials and exposes no HTTP preview endpoint. Integration fixtures
use `app.get(EmailSender)` and `takeLatest(email, purpose)` to consume a preview.
For manual local verification, use a debugger breakpoint in `PreviewEmailSender.send`
and open `message.actionUrl` in the configured frontend origin. Do not add token
logging or public preview routes. Previews disappear on restart and are never
bound in production.

Production requires `EMAIL_PROVIDER=http`, a configured HTTPS delivery URL,
private delivery key and validated sender identity. Auth actions create a durable
`notification_deliveries` row in the same transaction as the hashed action token.
`worker:delivery` renders server-owned HTML and plain text, then invokes the
replaceable gateway adapter with a stable delivery idempotency key and RFC
Message-ID. Redirects are forbidden and timeout/concurrency are bounded. Retry,
lease recovery and terminal failure are persisted; provider failure never rolls
back committed account/token state. See [account-and-email-delivery.md](account-and-email-delivery.md).

## CSRF

HttpOnly cookies attach automatically, so refresh/logout and login cookie-setting
need CSRF protection. Every auth POST, including public register/recovery and
Bearer mutations, requires an exact configured Origin and rejects
`Sec-Fetch-Site: cross-site`. Missing/null/foreign Origin is rejected; there is no
Referer fallback. Non-browser callers must explicitly supply the authorized
Origin. State-changing GET routes do not exist.

SameSite Strict is the default additional barrier. Credentialed CORS exposes
only the configured `WEB_URL`, never a wildcard; Authorization is explicit and
not ambient cookie access. A script on the trusted origin/XSS can still call
endpoints or steal in-memory access; Origin/SameSite are not XSS defenses.
The application renders user text as React text, uses no HTML injection and
does not accept redirect targets. Future CSP/proxy deployment must preserve this
same-origin model. Browser clients never fetch a hardcoded cross-site API.

## Cookies

`marketplace_refresh`: HttpOnly, host-only (no Domain), Path `/api/v1/auth`,
SameSite Strict by default (validated Lax is permitted), Secure mandatory in
production, Expires/Max-Age bounded by family absolute expiry. Local HTTP uses
Secure=false explicitly. None is unsupported. Cookie is deliberately not
`__Host-` because that prefix requires Path `/`; narrow auth scope is used instead.
Duplicate same-name credentials and oversized cookie headers are rejected.
TLS must terminate at the public origin. Cookie flags alone do not fix CSRF.

## RBAC

Exported `AuthenticationGuard`, `RolesGuard`, `CurrentPrincipal` and
`RequireRoles` form the public module API. Use authentication before roles.
`RequireRoles` uses any-of semantics over current persisted assignments; absent
requirements allow any authenticated identity. USER+MODERATOR and USER+ADMIN
work; ADMIN is not implicitly MODERATOR. Test-only role routes demonstrate
enforcement and are excluded from the production build. No self-elevation,
role-modification endpoint or admin panel exists. Resource ownership is separate
from roles and must be implemented by each future resource module.

## Account statuses

| Status                      | Authentication behavior                                            |
| --------------------------- | ------------------------------------------------------------------ |
| ACTIVE with emailVerifiedAt | login/access/refresh allowed if session is valid                   |
| PENDING_VERIFICATION        | no login/session/access/refresh; verification and recovery allowed |
| SUSPENDED                   | no login/access/refresh or action issuance/confirmation            |
| BLOCKED                     | no login/access/refresh or action issuance/confirmation            |

Status is checked from PostgreSQL on login, refresh and protected requests.
Correct-password status failures are distinct; wrong-password status responses
remain generic. No Redis account lock or persistent failed-password counter.

## Rate limiting

Atomic Redis Lua consumes fixed-window dimensions together, assigns TTL on first
increment and returns maximum remaining retry time. Keys contain HMAC identifiers,
not raw emails/IPs/tokens. Email dimension uses the Users canonical function;
refresh resolves the persisted family ID so rotation cannot reset its bucket.
Unknown credentials use an opaque fallback. Counters are database-namespaced to
isolate test suites. Rate-key HMAC is domain-separated from JWT signing use; a
coordinated signing-key rotation resets transient buckets.

| Policy               | Window seconds | IP attempts | Account/family/token attempts |
| -------------------- | -------------: | ----------: | ----------------------------: |
| register             |           3600 |          10 |                             3 |
| login                |            900 |          40 |                            10 |
| refresh              |             60 |         120 |                            30 |
| verification request |           3600 |          20 |                             3 |
| forgot               |           3600 |          20 |                             3 |
| reset                |            900 |          20 |                             5 |
| verification confirm |            900 |          30 |                             5 |
| password change      |            900 |          20 |                             5 |
| logout/logout-all    |             60 |         120 |                            30 |

429 includes `Retry-After`. Redis failure is **fail closed for auth mutations**
(503) to avoid bypassing brute-force/recovery limits. Existing Bearer reads use
PostgreSQL and remain correct without Redis. Repository readiness still requires
Redis, so an outage may drain instances according to deployment traffic gating;
startup also requires it. There is no unbounded process-memory fallback.
Use HA Redis and decide traffic gating explicitly before rollout.

Express does not trust forwarded IP headers. Behind a proxy, configure an explicit
trusted network boundary in a future deployment change; otherwise per-IP buckets
see proxy addresses. Do not blindly enable `trust proxy`. Account/family limits
still apply. Thresholds are centralized explicit policies; review actual traffic
before changing them. Rejected requests consume the window, not permanent locks.

## Audit and cleanup

Transactional events: AUTH_REGISTERED, AUTH_LOGIN_SUCCEEDED,
AUTH_SESSION_REFRESHED, AUTH_REFRESH_REUSE_DETECTED, AUTH_LOGGED_OUT,
AUTH_LOGGED_OUT_ALL, AUTH_EMAIL_VERIFIED, AUTH_PASSWORD_RESET_COMPLETED,
AUTH_PASSWORD_CHANGED. AUTH_LOGIN_FAILED and AUTH_PASSWORD_RESET_REQUESTED are
anonymous, with a fixed non-user AUTH target and allowlisted machine metadata.
Request IDs propagate to audits/delivery summaries. No credentials, email/IP,
headers, arbitrary bodies or request URLs enter logs/audits.

`SessionService.cleanup(limit)` is job-ready, default 500, maximum 1000 records
per category. Expired sessions and action tokens older than absolute expiry plus
one day are deleted in bounded SKIP LOCKED transactions; session FK cascade
removes the entire refresh history together. Live histories are never pruned
by consumption/revocation alone. A scheduler/queue and legal audit retention are
separate tasks. Audit rows are not removed by this cleanup.

## Verification and security considerations

Run README's quality commands and isolated integration infrastructure. Auth tests
own a new template0 database; no normal dev/test database is truncated. Tests cover
canonical registration and rollback, native hashing/upgrade detection, JWT attacks,
unknown/wrong login equivalence, statuses, safe me, rotation/history, replay commit,
concurrent refresh, absolute/idle expiry, logout/all, role changes/multiple roles,
verification expiry/replacement/purpose/replay, generic recovery/reset/replay,
password change, CSRF/CORS, real atomic Redis/TTL, failure-closed policy, cleanup,
safe logging/audits, OpenAPI and frontend single-flight/bootstrap/error handling.
Migration suite checks clean three-step apply, auth-only rollback/reapply and zero
ORM schema diff. Existing CI discovers all tests. Playwright is not installed;
no browser E2E suite is claimed.

Registration deliberately returns a 409 canonical duplicate error (UX enumeration
trade-off); login/recovery/verification requests are generic. Rate limiting reduces
abuse but cannot solve distributed denial of service. In-memory access and HttpOnly
refresh reduce persistence exposure, not XSS/compromised-browser risk. Email gateway
delivery, stable proxy topology, production load/cost tuning and durable dispatch
remain rollout work. No OAuth/MFA/SSO/passkeys or organization model is implemented.
Marketplace requests reuse this AuthClient/AuthenticationGuard; resource ownership
and lifecycle are documented in [listings.md](listings.md).
