# Ownership and responsibility

Roles are organizational functions, not invented people or accounts. The client
must assign named owners before staging.

| Capability                            | Application team      | Infrastructure / SRE                        | Security        | Product / Legal               |
| ------------------------------------- | --------------------- | ------------------------------------------- | --------------- | ----------------------------- |
| Web/API/domain modules                | **Responsible**       | Consulted                                   | Consulted       | Accountable for behavior      |
| Database schema/migrations            | Responsible           | **Accountable** for service/backup/capacity | Consulted       | Informed                      |
| API/Web/workers deployment            | Consulted             | **Responsible/Accountable**                 | Consulted       | Informed                      |
| DNS, TLS, ingress, registry           | Informed              | **Responsible/Accountable**                 | Consulted       | Informed                      |
| Redis/S3/email/map providers          | Consulted             | **Responsible**                             | Consulted       | Accountable for vendor/policy |
| Secrets and key rotation              | Consulted             | Responsible                                 | **Accountable** | Informed                      |
| Monitoring and on-call                | Consulted             | **Responsible/Accountable**                 | Consulted       | Informed                      |
| Vulnerability/incident handling       | Responsible for fixes | Responsible for containment                 | **Accountable** | Informed/approves disclosure  |
| RPO/RTO and retention                 | Consulted             | Responsible for implementation              | Consulted       | **Accountable**               |
| Privacy, terms, cookies, email policy | Consulted             | Informed                                    | Consulted       | **Responsible/Accountable**   |
| License/IP and third-party notices    | Informed              | Informed                                    | Consulted       | **Responsible/Accountable**   |

## Module ownership map

| Component       | Repository owner boundary                                        |
| --------------- | ---------------------------------------------------------------- |
| identity/access | `auth`, `users`, `account`, centralized guards/policies          |
| inventory       | `vehicles`, `parts`, `listings`, `media`, `geo`                  |
| discovery       | `search`, public list/map projections                            |
| trust/safety    | `moderation`, `admin`, `audit`                                   |
| engagement      | `favorites`, Saved Searches, `notifications`, outbox worker      |
| communication   | `messaging`, Socket.IO/Redis adapter, email delivery worker      |
| platform        | config, database, Redis, storage, logging, metrics, HTTP/runtime |
| client UI       | `apps/web` feature modules and centralized API/auth clients      |

Cross-module changes use public `index.ts` contracts. Deployment ownership does
not permit bypassing application authorization or module data boundaries.
