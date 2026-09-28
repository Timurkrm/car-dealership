# Production environment reference

`.env.production.example` is the canonical secret-free inventory. Production
processes receive variables from the orchestrator and secret manager with
`NODE_ENV=production` and `CONFIG_FROM_ENV=true`; the application does not depend
on a repository `.env` file in production.

## Variable groups

| Group         | Variables                                                                                        | Classification / owner                                           |
| ------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| Runtime       | `NODE_ENV`, `CONFIG_FROM_ENV`, `API_PORT`, `WEB_PORT`, `LOG_LEVEL`, timeouts, `TRUST_PROXY_HOPS` | deployment config / SRE                                          |
| Origins       | `WEB_URL`, server-only `API_URL`                                                                 | deployment config / SRE                                          |
| Web map build | `NEXT_PUBLIC_MAP_STYLE_URL`, `NEXT_PUBLIC_MAP_ATTRIBUTION`                                       | public build values / Product + SRE                              |
| PostgreSQL    | `DATABASE_*`                                                                                     | host/name/tuning config; password secret / DBA + SRE             |
| Redis         | `REDIS_*`                                                                                        | endpoint/TLS config; password secret / SRE                       |
| Storage       | `S3_*`, `MEDIA_*`                                                                                | endpoint/policy config; access secret or workload identity / SRE |
| Auth          | `AUTH_ACCESS_TOKEN_SECRET`, key ID, TTL/cookie/action-token settings                             | signing key secret; policy config / Security + app team          |
| Engagement    | saved-search, outbox and messaging limits                                                        | application config / app team                                    |
| Email         | `EMAIL_*`                                                                                        | URL/sender config; delivery key secret / SRE + Product           |
| Observability | `METRICS_ENABLED`, slow-operation thresholds                                                     | monitoring config / SRE                                          |
| Retention     | retention days and cleanup batch bounds                                                          | policy config / Legal/Product + SRE                              |

Only `NEXT_PUBLIC_*` values are embedded in browser JavaScript. They must contain
no private provider credentials. `API_URL` is a server-side origin. The auth
signing secret must be 32 random bytes represented as 64 lowercase hex
characters; provider/password requirements are validated at startup. Store
secrets in a managed secret service, scope read access per process/environment,
audit access and rotate through a coordinated deployment.

Production validation requires HTTPS public origins, Secure cookies, TLS for
PostgreSQL and Redis, HTTPS S3/email endpoints and non-preview email. Add private
CA trust with `NODE_EXTRA_CA_CERTS`; never disable TLS verification. Use different
keys, databases, buckets and provider accounts for staging and production.

## Build-time versus runtime

Web `API_URL`, map style and attribution are consumed during the Next production
build. Build a separate Web artifact when public build values differ. The backend
image is environment-neutral. Release CI must record the chosen public values
without printing secrets.

## Rotation

- Database/Redis/S3/email credentials: issue new, deploy, verify, revoke old.
- Auth signing key: follow [Authentication key rotation](../authentication.md);
  active sessions/cursors may be affected by rotation.
- Provider public map token: restrict both old/new tokens during overlap, rebuild
  Web, verify, then revoke old.

Never place real values in source control, image build arguments, release notes,
logs or support tickets. The client must provide environment-specific secret
names and ownership before staging deployment.
