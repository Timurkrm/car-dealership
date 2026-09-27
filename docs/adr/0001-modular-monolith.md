# ADR 0001: Modular monolith

Status: Accepted

Date: 2026-09-17

## Context

A vehicle marketplace with geographic search will be handed to a professional
team. At this stage there is no established business schema, traffic profile or
independent service ownership. Maintainable boundaries, correctness and simple
development/operations matter more than speculative distribution.

## Decision

Use a workspace monorepo with Next.js web and one NestJS modular backend. Define
the thirteen domain modules explicitly. A module owns its data and publishes only
intentional APIs through its public entry point. Infrastructure is separate from
business ownership. PostgreSQL/PostGIS is authoritative; Redis and S3 serve their
specific infrastructure responsibilities. Use migrations, strict TypeScript,
tests and automated quality gates from the start.

## Alternatives

- Microservices now: independent deployment, but introduce distributed consistency,
  retries, contract evolution, networking and observability costs without evidence.
- An unstructured monolith: easy to start but allows arbitrary cross-domain data
  access and unclear ownership, making future changes risky.
- A separate abstraction layer for every entity: increases indirection before
  there are real rules or infrastructure alternatives to isolate.

## Consequences

Local development is straightforward and initial operations need only two app
processes and backing services. Domain boundaries require enforcement in imports,
database access and reviews; the monolith does not automatically create them.
Backend modules share deployment and failure scope. Future service extraction
will require explicit contracts and migration plans, but existing ownership can
guide it. Search, geo, media, messaging, notifications and analytics are possible
candidates, not a committed service roadmap. Shared packages appear only with
actual reuse. Business schema design remains the next separate task.
