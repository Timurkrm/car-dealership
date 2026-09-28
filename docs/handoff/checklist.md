# Client handoff checklist

## Repository and knowledge

- [x] Source, lockfile, migrations, CI workflows and container Dockerfiles included.
- [x] Architecture, data model, ADR index and domain contracts included.
- [x] Local onboarding, test commands and production deployment contract included.
- [x] QA/security/load/capacity evidence included without production data.
- [ ] Client repository/branch protection, review policy and named maintainers configured.
- [ ] Client approves license/IP terms and required third-party notice/SBOM handling.

## Infrastructure and credentials

- [ ] Client owns domain/DNS and trusted TLS certificate automation.
- [ ] Client owns immutable container registry and CI deployment identities.
- [ ] Managed PostgreSQL/PostGIS, Redis and private S3 are provisioned.
- [ ] Email and map provider accounts, quota and production domains are provisioned.
- [ ] Secret manager contains separate staging/production values; no credential is in Git.
- [ ] Monitoring/logging/on-call and alert receiver ownership are configured.
- [ ] Backup/PITR/off-site/object-lock policy and provider accounts are configured.

## Environment and data

- [ ] `.env.production.example` mapped to client secret/config keys.
- [ ] Runtime/migration DB roles and total connection budget reviewed by DBA.
- [ ] Redis TLS, persistence, no-eviction and failover behavior verified.
- [ ] S3 IAM, CORS, encryption, versioning, lifecycle and restore verified.
- [ ] Approved production Cars/Parts reference catalogs supplied/imported.
- [ ] First verified ADMIN bootstrapped by authorized operator and audit checked.
- [ ] No demo/test account or listing is seeded in production.

## Security and policy

- [ ] Private vulnerability reporting channel and response SLA configured.
- [ ] Independent penetration test completed or formally waived by risk owner.
- [ ] RPO/RTO approved; retention/deletion, privacy, terms, cookie and email policy approved.
- [ ] Auth/provider/DB/Redis/S3 rotation owners and cadence documented.
- [ ] CSP/edge headers, CORS, proxy trust, WebSocket and internal metrics isolation verified.

## Release and operations

- [ ] `0.1.0-rc.1` Git tag created from approved commit; image digests/SBOM/scan recorded.
- [ ] Production-like staging deployed from those exact digests.
- [ ] Staging migration, providers, proxy browser flow, topology and baseline load pass.
- [ ] Managed-service backup restore/PITR drill recorded at representative scale.
- [ ] Release checklist, rollback authority and observation window approved.
- [ ] Routine backup, restore drill, integrity and cleanup schedules installed with alerts.
- [ ] Production deployment and post-deploy observation evidence accepted.

Credentials are transferred only through client-owned systems. Checklist evidence
belongs in the client's change/release system and must not contain secret values.
