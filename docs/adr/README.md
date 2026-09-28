# Architecture decision records

| ADR                                                    | Decision                       |
| ------------------------------------------------------ | ------------------------------ |
| [0001](0001-modular-monolith.md)                       | Modular monolith               |
| [0002](0002-marketplace-data-model.md)                 | Marketplace data model         |
| [0003](0003-browser-authentication-strategy.md)        | Browser authentication         |
| [0004](0004-vehicle-observation-isolation.md)          | Immutable vehicle observations |
| [0005](0005-media-processing-architecture.md)          | Asynchronous media processing  |
| [0006](0006-postgresql-postgis-search.md)              | PostgreSQL/PostGIS search      |
| [0007](0007-multi-category-listings.md)                | Cars and Parts listing root    |
| [0008](0008-server-assisted-map-clustering.md)         | Server-assisted map clustering |
| [0009](0009-moderator-removal-uses-archive.md)         | Moderator archive semantics    |
| [0010](0010-transactional-outbox-for-domain-events.md) | Transactional outbox           |
| [0011](0011-realtime-messaging-transport.md)           | Realtime messaging transport   |
| [0012](0012-asynchronous-email-delivery.md)            | Asynchronous email delivery    |

ADRs describe durable architectural choices. Deployment runbooks and provider
selection belong in deployment/operations documentation until a vendor choice
creates a durable architecture decision.
