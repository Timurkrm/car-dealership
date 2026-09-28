# Internal security test report

## Scope and method

This is an internal engineering assessment of the application and its isolated
test infrastructure. It combines browser/API abuse cases, integration tests,
machine-readable authorization and ownership matrices, dependency audit and a
high-confidence repository secret scan. It is not an independent penetration
test.

The tested roles are anonymous, USER, MODERATOR and ADMIN. Owned-resource checks
cover listings, media, favorites, saved searches, notifications, conversations,
messages and sessions. `security/authorization-matrix.json` and
`security/ownership-matrix.json` are the reviewable expected policy.

## Tested behavior

- Anonymous access returns 401; wrong roles return 403; foreign owned or
  participant-scoped identifiers return privacy-preserving 404 responses.
- Vehicle/Part subtype confusion, moderator/admin separation and blocked account
  behavior are covered by HTTP integration and browser regression suites.
- Sort injection, malformed cursor/filter/geo values, excessive limits and
  mass-assignment fields are rejected by validation and SQL allowlists/bindings.
- Reflected XSS payloads remain text and do not create attacker-controlled DOM.
  Stored message/email rendering escaping is covered by unit and integration tests.
- CORS, CSRF/origin policy, CSP, frame denial, `nosniff`, secure auth storage,
  JWT validation, refresh rotation/replay and session revocation are covered.
- Upload tests use real MinIO and Sharp and cover MIME/signature mismatch,
  corrupt/oversized/pixel-bomb input, ownership, retry and delete/worker races.
- Exact listing location, message content, credentials and storage keys are not
  exposed by public DTOs or operational output.
- Destructive operational commands and production seed/restore guards are covered
  by integration tests.

## Confirmed finding

| Severity | Description                                                                                                                          | Fix                                                                                                               | Regression evidence                                              |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| High     | The dependency graph resolved `@nestjs/platform-express` 11.2.5 and vulnerable Multer 2.2.0. `npm audit` reported two High findings. | Updated `@nestjs/platform-express` to 11.2.6 and refreshed the lockfile, which resolves the patched Multer graph. | A repeated `npm audit --audit-level=high` reports zero findings. |

No Critical or High confirmed finding remains open. The browser defects recorded
in the browser report were correctness/compatibility findings rather than a
security boundary bypass.

A rare session-creation clock race was also found during the expanded browser
run. It could cause a safe 500 response, not an authentication bypass: PostgreSQL
rejected `last_used_at < created_at`. Session insertion now uses
`CURRENT_TIMESTAMP` for the initial activity timestamp, matching the database
default for creation time.

## OWASP-oriented coverage

The highest-value checks map to Broken Access Control, Injection, Security
Misconfiguration, Identification and Authentication Failures, Software and Data
Integrity Failures, and SSRF/upload boundaries. The assessment used the actual
API surface and did not treat a generic checklist as proof.

## Residual risks

- Real reverse-proxy/TLS behavior, production CSP provider origins and production
  secret injection need staging verification.
- The preview email adapter and local map style do not prove real-provider
  security or availability.
- The repository scan cannot detect secrets held outside Git or validate rotation.
- An independent penetration test and real-device security review remain external
  release activities.
