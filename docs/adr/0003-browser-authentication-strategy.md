# ADR 0003: Browser access JWT and rotating HttpOnly refresh session

Status: Accepted. Date: 2026-09-17.

## Context

The modular monolith already owns user profiles/roles, credentials, logical
sessions and token history. A Next.js browser needs short-lived access, multiple
devices, immediate blocking/revocation, safe recovery and reusable authorization
without putting reusable credentials in browser persistence or logs.

## Decision

Use ten-minute HS256 access JWTs via jose in client memory and random 256-bit
refresh credentials in host-only HttpOnly/Secure/SameSite Strict cookies scoped
to `/api/v1/auth`. Next.js proxies API calls under the frontend origin. Every auth
POST validates exact Origin; CORS is credentialed only for configured WEB_URL.

PostgreSQL remains authoritative for every protected request's session, account
state and current roles. No access blacklist/security cache is needed. A logical
session is its own family ID, with one live digest and complete consumed history.
Refresh locks user → session → token, consumes A and inserts B transactionally;
replay commits family revocation and audit before returning an error. Strict
concurrent reuse revokes the winner too. Single-flight and optional cross-tab
Web Locks reduce legitimate races; no consumed-token grace window is introduced.

Email verification is a separate timestamp fact. Pending accounts receive no
session. A minimal purpose-specific action table holds verification/reset
digests with expiry, replacement and single-use rules. Argon2id hashes passwords;
reset revokes every session, password change preserves current and revokes others.
Email delivery uses a replaceable adapter outside transactions. Redis limits auth
mutations with HMAC identifiers and fails closed; ordinary access reads use PG.

## Alternatives

- Server-only opaque cookie session: viable, but requires cookie CSRF handling
  for every future API call and a different browser/API contract.
- Persisted browser JWTs: rejected because reusable credentials survive reload
  and remain available to scripts accessing browser storage.
- Long access JWT with cache/blacklist: adds another security-state dependency
  and weakens immediate account/role enforcement if omitted.
- Asymmetric signing: unnecessary for one trusted modular monolith; revisit
  when independent verification boundaries exist.
- Refresh replay grace: reduces false positives but needs extra credential
  handling and weakens strict replay semantics. Current explicit fail-closed
  behavior is simpler to review and test.

## Consequences

Protected requests perform three bounded indexed identity/session/role reads;
status/role/revocation changes apply immediately on subsequent requests. Cookie
security depends on a same-origin HTTPS deployment. Strict reuse can require
relogin after an ambiguous transport failure or uncoordinated clients. Redis
outage affects auth mutations/readiness by deliberate policy. Signing keys need
coordinated secret-manager rotation. Legacy ACTIVE records without verification
evidence require reconciliation. Gateway delivery/outbox durability, production
performance tuning, reverse-proxy trust and broader rollout remain explicit work.
See [authentication.md](../authentication.md) for executable behavior and limits.
