# Security policy

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Report it through the
client's private security channel and include the affected version, reproducible
steps, impact, and any proposed mitigation. The receiving mailbox/ticket queue
and response SLA are **PENDING CLIENT SECURITY**; configure them before external
launch.

Do not include production credentials, access tokens, personal data, private
messages, exact seller locations, or database dumps in a report. Use synthetic
data and a private attachment channel approved by the client.

## Supported versions

`0.1.0-rc.1` is a release candidate. A supported-production-version policy is
**PENDING CLIENT SECURITY**. Until it is approved, security fixes apply to the
active release branch only and must pass the normal release gates.

## Coordinated response

The application team triages application defects; Infrastructure/SRE owns edge,
cloud and managed-service incidents; Security owns severity and disclosure
decisions. Rotate exposed credentials immediately through the client secret
manager, revoke affected sessions where applicable, preserve audit evidence, and
follow [Incident response](docs/operations/runbook.md#incident-checklist).

Repository checks (`npm audit`, image scanning and `npm run security:secrets`)
are preventive controls and do not replace an independent penetration test.
