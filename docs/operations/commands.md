# Operational command reference

Run commands from an audited operator environment using the exact target
configuration. `--confirm` is a safety gate, not authorization.

| Command                                    | Purpose                                         | Production-safe             | Confirmation / notes                                                          |
| ------------------------------------------ | ----------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------- |
| `npm run ops:status -- --json`             | Read dependency/version/backlog/table status    | Yes, read-only              | None; protect output                                                          |
| `npm run ops:verify-data`                  | Check critical relational invariants            | Yes, read-only              | Exit 2 means incident                                                         |
| `npm run ops:storage-probe`                | Private S3 put/get/delete probe                 | Yes, controlled             | Uses configured bucket                                                        |
| `npm run maintenance:cleanup -- --dry-run` | Preview bounded retention work                  | Yes, read-only              | Run before mutation                                                           |
| `npm run maintenance:cleanup -- --confirm` | Execute bounded retention cleanup               | Yes, destructive            | Required; approved policy                                                     |
| `npm run db:backup -- ...`                 | Create guarded logical backup                   | Yes                         | Production target and overwrite guards apply                                  |
| `npm run ops:restore-test`                 | Disposable backup/fresh-restore/integrity drill | No against production DB    | Uses guarded isolated DB names                                                |
| `npm run migration:run`                    | Apply pending migrations                        | Yes, deployment job only    | One runner; reviewed backup gate                                              |
| `npm run migration:revert`                 | Revert last migration                           | Dangerous                   | Manual review; never routine rollback                                         |
| `npm run bootstrap:admin -- --confirm`     | Grant first ADMIN to verified account           | Yes, one-time/operator-only | `ADMIN_BOOTSTRAP_EMAIL`; audited                                              |
| `npm run seed:catalog`                     | Small development reference catalog             | **No**                      | Command refuses production                                                    |
| `npm run dev:grant-admin`                  | Development role grant                          | **No**                      | Command refuses non-development                                               |
| `npm run delivery:retry -- ...`            | Retry eligible delivery rows                    | Conditional                 | Review scope and runbook                                                      |
| `npm run outbox:recover -- ...`            | Recover eligible outbox work                    | Conditional                 | Review backlog/status first                                                   |
| `npm run media:cleanup`                    | Media storage cleanup workflow                  | Conditional                 | Verify dry operational state/storage                                          |
| `npm run smoke:production`                 | Anonymous non-destructive HTTP smoke            | Yes                         | Set target origin                                                             |
| `npm run smoke:authenticated`              | Auth/session/WS smoke                           | Staging or approved account | Credentials only through environment                                          |
| `npm run benchmark:media`                  | Synthetic media capacity check                  | Reference/staging only      | Creates/removes draft DB rows; leaves storage objects until lifecycle cleanup |

Query-plan generators and load/E2E fixtures create large synthetic datasets and
belong only on isolated test infrastructure. Never point `search:plans`,
`moderation:plans`, `engagement:plans`, `messaging:plans`,
`account-delivery:plans`, Playwright, load or resilience commands at production.
