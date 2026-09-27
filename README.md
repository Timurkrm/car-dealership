# Vehicle Marketplace

Архитектурный фундамент платформы автомобильных объявлений: Next.js frontend,
NestJS REST API и локальная инфраструктура PostgreSQL/PostGIS, Redis, MinIO.
Реализованы модель marketplace/auth/media из 32 таблиц, регистрация, authentication,
сессии, RBAC, подтверждение email и восстановление пароля с функциональными
страницами. Реализованы каталог автомобилей, seller workflow объявлений с
optimistic concurrency, direct-to-S3 фотографии с background processing, публичные страницы
и единый Cars/Parts Geo/Search: subtype-фильтры, cursor pagination, PostGIS
bbox/radius/nearest, facets и server-clustered MapLibre map. Добавлен Parts domain:
общий Listing root, совместимость, каталог и смешанный кабинет продавца. Cars и Parts
имеют общие LIST/SPLIT/MAP режимы, синхронизацию selection, URL camera state и
privacy-safe Near Me. Контракты и ограничения: [parts.md](docs/parts.md),
[listings.md](docs/listings.md), [media.md](docs/media.md),
[search-and-geo.md](docs/search-and-geo.md), [map.md](docs/map.md).

## Requirements

- Node.js 24 LTS, **24.15.0 или новее в ветке 24** (`.nvmrc`: 24.21.0).
- npm 11 (входит в выбранный Node.js).
- Docker Engine / Docker Desktop с Linux containers и Docker Compose v2.
- Свободные локальные порты 3000, 4000, 5432, 6379, 9000, 9001.
  Тестовая инфраструктура использует 55432, 56379, 59000, 59001.

В текущей Windows-среде Node.js был подготовлен как portable runtime в
игнорируемой `.tools/node-v24.21.0-win-x64`. Если системный `node` отсутствует,
активируйте его в PowerShell из корня проекта перед командами ниже:

```powershell
$env:PATH = (Join-Path (Get-Location) '.tools/node-v24.21.0-win-x64') + ';' + $env:PATH
```

В новом clone `.tools` отсутствует: установите Node.js из Requirements.

## Installation

```sh
npm ci
npm run env:init
npm run infra:up
npm run migration:run
npm run seed:catalog       # локальные справочники для формы автомобиля
npm run dev
```

`npm ci` использует `package-lock.json`. `env:init` создаёт `.env` и `.env.test`
из примеров со случайными локальными паролями, не печатает их и сохраняет уже
существующие credentials; в существующие файлы добавляет только отсутствующие
auth settings. Эти файлы игнорируются Git. Не используйте локальные MinIO
root credentials в production. После изменения пароля в `.env` существующий
PostgreSQL volume сохраняет старый пароль: обновляйте учётные данные явно, не
удаляйте volume с нужными данными.

## Environment

Список переменных и локальные значения находятся в `.env.example` и
`.env.test.example`. Ручной вариант: скопируйте примеры и замените placeholders.

| Переменные                                                                    | Назначение                                                             |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `NODE_ENV`, `API_PORT`, `WEB_PORT`                                            | Среда API и порты приложений                                           |
| `DATABASE_HOST/PORT/NAME/USER/PASSWORD`, `DATABASE_SSL`                       | PostgreSQL; TLS с проверкой сертификата                                |
| `REDIS_HOST/PORT/PASSWORD`, `REDIS_TLS`                                       | Аутентифицированный Redis                                              |
| `S3_ENDPOINT/REGION/BUCKET/ACCESS_KEY/SECRET_KEY`                             | S3 SDK; endpoint можно не задавать для AWS                             |
| `S3_FORCE_PATH_STYLE`, `S3_PORT`, `S3_CONSOLE_PORT`                           | MinIO/совместимость SDK и локальные порты Compose                      |
| `WEB_URL`                                                                     | Единственный разрешённый CORS origin API                               |
| `API_URL`                                                                     | Origin API для запросов **с Next.js сервера**, без `/api/v1`           |
| `NEXT_PUBLIC_MAP_STYLE_URL`, `NEXT_PUBLIC_MAP_ATTRIBUTION`                    | Public MapLibre style и optional plain-text attribution; build-time    |
| `LOG_LEVEL`                                                                   | `debug`, `info`, `warn`, `error`                                       |
| `SHUTDOWN_TIMEOUT_MS`, `SLOW_REQUEST_MS`, `SLOW_JOB_MS`                       | bounded drain and safe slow-operation logging                          |
| `TRUST_PROXY_HOPS`                                                            | exact trusted reverse-proxy hop count; `0` for direct traffic          |
| `DATABASE_POOL_MAX`, `DATABASE_*_TIMEOUT_MS`                                  | explicit pool/acquisition/query/lock/idle transaction limits           |
| `*_RETENTION_DAYS`, `CLEANUP_BATCH_SIZE/MAX_ROWS_PER_RUN`                     | bounded operational cleanup policy                                     |
| `SWAGGER_ENABLED`                                                             | `true`/`false`; по умолчанию только development                        |
| `AUTH_ACCESS_TOKEN_SECRET`, `AUTH_ACCESS_KEY_ID`                              | 32-byte random signing key (64 lowercase hex) и key ID; не публиковать |
| `AUTH_ACCESS_TOKEN_TTL`, `AUTH_REFRESH_TOKEN_TTL`, `AUTH_REFRESH_IDLE_TTL`    | Секунды; defaults 600 / 2592000 / 604800                               |
| `AUTH_COOKIE_SECURE`, `AUTH_COOKIE_SAME_SITE`                                 | Production Secure=true; Strict default, None запрещён                  |
| `AUTH_VERIFICATION_TOKEN_TTL`, `AUTH_PASSWORD_RESET_TOKEN_TTL`                | Expiry action links; defaults 86400 / 1800 секунд                      |
| `EMAIL_PROVIDER`, `EMAIL_DELIVERY_URL`, `EMAIL_DELIVERY_KEY`                  | preview local/test; production HTTPS email gateway и private key       |
| `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME`                                       | validated sender identity                                              |
| `EMAIL_DELIVERY_BATCH_SIZE/MAX_ATTEMPTS/LEASE_SECONDS/CONCURRENCY/TIMEOUT_MS` | bounded durable delivery worker                                        |

Конфигурация API валидируется до подключения зависимостей. Обязательные поля,
порты, URL и boolean проверяются; сообщения не содержат переданные значения
секретов. Production по умолчанию включает TLS для PostgreSQL/Redis, требует
HTTPS для публичного `WEB_URL` и S3 endpoint и выключает Swagger. CA должны быть
доверенными для Node.js; при необходимости настройте `NODE_EXTRA_CA_CERTS`.
`API_URL` может использовать HTTP внутри доверенной сети: он не передаётся
браузеру. Никогда не публикуйте backend credentials через `NEXT_PUBLIC_*`. Map style
URL является публичным build-time значением и должен указывать на разрешённого provider.

API читает корневой `.env`, тестовые команды — `.env.test`. Уже заданные
переменные процесса имеют приоритет. В production задавайте `NODE_ENV=production`
в окружении процесса и передавайте параметры через secret manager/deployment.
Next.js самостоятельно устанавливает `NODE_ENV` для dev/build/start.

Production auth fail-fast требует Secure cookie и настроенный HTTP email adapter;
preview запрещён. Signing-key rotation описана в [authentication.md](docs/authentication.md).
Deploy `/api/v1` под тем же HTTPS origin, что и web; Next rewrites используют
server-only API_URL. Все auth POST требуют точный Origin WEB_URL.

## Infrastructure

Engagement configuration is validated at startup: `SAVED_SEARCH_MAX_PER_USER`
(default 50), `OUTBOX_BATCH_SIZE` (50), `OUTBOX_LEASE_SECONDS` (120), and
`OUTBOX_MAX_ATTEMPTS` (8). Examples are present in `.env.example` and
`.env.test.example`.

```sh
npm run infra:up
docker compose ps
npm run infra:down
```

Прямое поднятие: `docker compose up -d`. Root-команда дополнительно ждёт
healthchecks основных сервисов и отдельно проверяет завершение `minio-init`,
который создаёт приватный bucket идемпотентно. Контейнеры публикуют порты
только на loopback, данные сохраняются в named volumes. `infra:down` не удаляет
данные. Конфигурация находится в `compose.yaml`; [подробнее](infra/README.md).

Community MinIO [больше не поддерживается](https://github.com/minio/minio).
Используется фиксированный legacy image из Quay только для локальной среды;
production S3 provider выбирается отдельным решением.

## Development

```sh
npm run dev           # оба приложения; остановка Ctrl+C
npm run dev:api       # компиляция/watch API
npm run dev:web       # Next.js dev
```

The durable engagement consumer is a separate process:

```sh
npm run worker:engagement
npm run outbox:recover             # recover all FAILED events
npm run outbox:recover -- <uuid>   # recover one event
npm run worker:delivery            # durable external email delivery
npm run delivery:retry -- <uuid>   # requeue one FAILED email; omit UUID for all
```

See [favorites-saved-searches-notifications.md](docs/favorites-saved-searches-notifications.md)
and the [manual engagement checklist](docs/engagement-qa.md).

- Web: <http://localhost:3000>.
- Account pages: `/account`, `/account/profile`, `/account/security`,
  `/account/notifications/settings`, `/account/email-change/confirm`.
- Liveness: <http://localhost:4000/api/v1/health>.
- Readiness: <http://localhost:4000/api/v1/health/ready>.
- Swagger: <http://localhost:4000/api/docs>.
- OpenAPI JSON: <http://localhost:4000/api/docs-json>.
- MinIO console: <http://localhost:9001>, credentials из локального `.env`.

Development homepage запрашивает health API через общий клиент на сервере
Next.js и показывает `API: available/unavailable`. Loading fallback виден
во время запроса; запрос ограничен 3 секундами. В production диагностика скрыта.

Readiness требует доступный writable PostgreSQL с PostGIS и возвращает только
`status`; при graceful shutdown или сбое DB это 503. Redis, object storage,
email и map provider деградируют только зависящие от них возможности и не
раскрываются в public health response. Rate-limited routes при сбое Redis
fail closed. Подробная матрица: [reliability.md](docs/reliability.md).

Регистрация создаёт pending account; вход возможен после подтверждения email.
Local/test preview не отправляет письма и не печатает токены: integration tests
получают их через `PreviewEmailSender.takeLatest`; для ручного сценария установите
debugger breakpoint в `PreviewEmailSender.send` и откройте `message.actionUrl`.
Публичного preview endpoint нет. Production использует validated HTTPS gateway
adapter и отдельный durable worker; внешний smoke требует provider credentials.

## Database

```sh
npm run migration:run
npm run migration:revert
npm run migration:create -- AddVehicleSchema
npm run migration:generate -- AddVehicleSchema
```

`create/generate` принимают имя в PascalCase, без пути. CLI размещает миграции
в `apps/api/src/platform/database/migrations`. `generate/run/revert` сначала
компилируют API и используют compiled DataSource. Просматривайте SQL до запуска.
Entities зарегистрированы централизованно, но расположены в модулях-владельцах.
После применения текущих migrations ORM schema diff должен быть пустым.
Новые изменения добавляйте отдельными migrations; применённые файлы не изменяйте.

Initial migration выполняет `CREATE EXTENSION IF NOT EXISTS postgis`. Для неё
требуются права установки extension; production migrations запускайте отдельно
под deployment/migration role. Автоматического применения migrations при
старте HTTP-сервера нет, `synchronize` всегда выключен. PostGIS image может
уже иметь extension — миграция работает в обоих случаях.

Rollback initial migration удаляет запись из migration history, **сохраняя
extension**: она могла существовать раньше или использоваться другими схемами.
Удалять её автоматически небезопасно. Следующая migration `MarketplaceSchema`
создаёт 21 таблицу с FK/CHECK/unique и B-tree/GiST indexes. Её rollback удаляет
marketplace tables в порядке от дочерних к родительским, сохраняя PostGIS.
Rollback уничтожает данные этих таблиц; production recovery требует отдельного плана.

Третья migration `Authentication` добавляет `users.email_verified_at` и
`auth_action_tokens` с digest/purpose/expiry/single-use constraints/indexes.
Auth-only rollback удаляет эту таблицу/колонку и сохраняет marketplace/PostGIS;
при этом теряется verification/token data. Legacy ACTIVE без подтверждённого
verification fact не допускаются к login; автоматического backfill нет.

Четвёртая migration `ListingSellerUpdatedIndex` добавляет индекс seller/updatedAt/UUID
для списка `updated_newest`. Rollback удаляет только этот индекс. Поведение,
ETag/CAS и публичные/приватные DTO описаны в [docs/listings.md](docs/listings.md).

Модель, ER diagram, индексы и retention описаны в [docs/data-model.md](docs/data-model.md).
Необязательный `npm run seed:catalog` добавляет небольшой повторяемый development
справочник без пользователей/credentials; в production команда запрещена.

После сборки миграции можно запускать без TypeScript/devDependencies:

```sh
node node_modules/typeorm/cli.js migration:run -d apps/api/dist/platform/database/data-source.js
```

## Production operations

```sh
npm run ops:status -- --json
npm run ops:verify-data
npm run ops:storage-probe
npm run maintenance:cleanup -- --dry-run
npm run db:backup -- --output backups/marketplace.dump
npm run ops:restore-test
npm run resilience:test
SMOKE_API_URL=https://marketplace.example npm run smoke:production
```

Backup output directory must already exist; production backup and mutating cleanup
also require `--confirm`. Restore/resilience commands are destructive only to guarded,
isolated `_test` databases and the `marketplace-test` Compose project. Start it with
`npm run infra:test:up` and always stop it with `npm run infra:test:down`. See the
[operations runbook](docs/operations/runbook.md), [reliability model](docs/reliability.md)
and [disaster recovery](docs/disaster-recovery.md).

## Tests

```sh
npm test
npm run infra:test:up
NODE_ENV=test npm run migration:run # POSIX; PowerShell ниже
npm run test:integration
npm run search:plans
npm run engagement:plans
npm run messaging:plans
npm run account-delivery:plans
npm run infra:test:down
```

`npm test`: backend unit + HTTP integration с подменёнными зависимостями,
frontend tests API client/config. Используется встроенный Node.js test runner,
TypeScript компилируется перед тестами; дополнительных test frameworks нет.
HTTP fixtures существуют только в `test/`, production build их не включает.
Auth unit tests исполняют native Argon2id/JWT/policies; frontend tests проверяют
bootstrap, single-flight, bounded retries, безопасный state и logout.

`test:integration`: последовательно запускаемые изолированные test-файлы с реальными
PostgreSQL/PostGIS, Redis и S3, clean apply/repeat/
rollback/reapply, соответствие ORM и SQL, constraints/FK/indexes, spatial queries,
конкурентный version CAS, privacy/retention и all-table persistence; HTTP
health/readiness, сбой database connection,
отключённый Swagger и закрытие ресурсов. Команда принудительно использует
`NODE_ENV=test`, требует `DATABASE_NAME` с суффиксом `_test`. Compose test project
имеет отдельные volumes, пароли и порты. Не подставляйте туда обычную dev базу.
Если в текущем shell заданы `DATABASE_*`, очистите эти overrides до теста.
Проверки схемы создают собственную временную базу из template0 и удаляют только её;
настроенные dev/test databases не пересоздаются. Test DB role нужны CREATEDB и
права установки PostGIS. Файлы интеграционных тестов выполняются последовательно.

Auth HTTP integration использует собственную пустую базу и real Redis: register,
partial-failure rollback, enumeration-resistant responses, pending/blocked/suspended,
me, rotation/replay/concurrent refresh, idle/absolute expiry, logout/all, RBAC,
verification/reset expiry/purpose/replay, password change, CSRF/CORS, atomic rate
limits/TTL, cleanup, audit/log redaction и OpenAPI. Migration suite проверяет
clean apply всех десяти миграций, targeted rollback/reapply с нулевым ORM diff.
Playwright infrastructure отсутствует; browser E2E suite не добавлен.

```powershell
npm run infra:test:up
$env:NODE_ENV = 'test'
npm run migration:run
Remove-Item Env:NODE_ENV
npm run test:integration
npm run infra:test:down
```

## Фотографии и media worker

После `npm run infra:up` и применения migrations запустите API/web и отдельный worker:

```sh
npm run build --workspace @marketplace/api
npm run worker:media
```

Worker — отдельный процесс модульного монолита; API не обрабатывает изображения в HTTP.
На `/sell` выберите автомобиль или запчасть (`/sell/car`, `/sell/part`), сохраните черновик, затем в управлении объявлением выберите/перетащите
JPEG/PNG/WebP. Browser загружает напрямую в приватный S3/MinIO; после complete worker
создаёт thumbnail/medium/large WebP. UI показывает progress, processing/error, главное
фото и клавиатурное изменение порядка. Submit требует READY primary и завершения
остальных uploads. Локальный MinIO CORS ограничен WEB_URL; endpoint должен быть доступен
браузеру. Production provider требует собственного приватного bucket/CORS/IAM setup.

`MEDIA_MAX_FILE_SIZE` (15 MiB), `MEDIA_MAX_IMAGES_PER_LISTING` (25), TTL (600 seconds),
dimension/pixel bounds, widths 320/960/1600, quality 82 и concurrency 2 перечислены в
`.env.example`; WebP фиксирован. `npm run env:init` добавляет недостающие defaults,
сохраняя существующие credentials. `npm run media:cleanup` отправляет ограниченную
порцию cleanup jobs; выполнение требует worker. Он также автоматически восстанавливает
dispatch и выполняет cleanup. Originals удаляются после upload TTL + grace;
READY variants сохраняются, DELETED tombstones остаются для retry/reconciliation.

`npm run test:integration` запускает настоящий worker на owned test database, отдельной
BullMQ queue и реальном test MinIO. Проверяются upload, spoof/oversize/pixels/EXIF,
retry, primary/order, deletion/submit races, orphan cleanup и redaction. Тесты не используют
production storage. Полная модель и Mermaid diagrams: [Media](docs/media.md),
[ADR 0005](docs/adr/0005-media-processing-architecture.md).

## Lint / Build

```sh
npm run lint
npm run typecheck
npm run format
npm run build
npm run start --workspace @marketplace/api
npm run start --workspace @marketplace/web
```

Lint включает ESLint, проверку module boundaries/cycles и Prettier. Strict
TypeScript включён в обоих приложениях. Next build не требует запущенного API.
Для локального запуска compiled API используйте `.env`; для production нужен
полный production environment. `next start` всегда запускает production UI.

## Architecture / CI

- [Architecture](docs/architecture.md)
- [Parts domain](docs/parts.md)
- [ADR 0007: Multi-category Listing](docs/adr/0007-multi-category-listings.md)
- [Data model / ER diagram](docs/data-model.md)
- [ADR 0001: Modular monolith](docs/adr/0001-modular-monolith.md)
- [ADR 0002: Marketplace persistence](docs/adr/0002-marketplace-data-model.md)
- [Authentication](docs/authentication.md)
- [Moderation and administration](docs/moderation-and-admin.md)
- [Moderation manual QA](docs/moderation-qa.md)
- [ADR 0009: Moderator removal uses archive](docs/adr/0009-moderator-removal-uses-archive.md)
- [ADR 0003: Browser authentication](docs/adr/0003-browser-authentication-strategy.md)
- [Messaging and realtime](docs/messaging-and-realtime.md)
- [Messaging manual QA](docs/messaging-qa.md)
- [ADR 0011: Realtime messaging transport](docs/adr/0011-realtime-messaging-transport.md)
- [Account and email delivery](docs/account-and-email-delivery.md)
- [Account/email manual QA](docs/account-email-qa.md)
- [ADR 0012: Asynchronous email delivery](docs/adr/0012-asynchronous-email-delivery.md)
- [Reliability and dependency model](docs/reliability.md)
- [Operations runbook](docs/operations/runbook.md)
- [Disaster recovery](docs/disaster-recovery.md)
- [Alert recommendations](docs/operations/alerts.md)
- [Production readiness checklist](docs/operations/production-readiness-checklist.md)
- [Agent rules](AGENTS.md)
- `.github/workflows/quality.yml`: npm ci, lint, typecheck, tests, isolated
  infrastructure integration и оба production builds на push/pull request.
- `.github/workflows/production-readiness.yml`: scheduled/manual restore,
  integrity, cleanup dry-run и controlled dependency restart workflows.

В папке изначально не было `.git`; инициализация репозитория, commits и публикация
не выполняются автоматически. `packages/` появится при реальном повторном
использовании; backend domain types пока не публикуются общим frontend package.
Следующий этап — Full QA / Security / Load Testing; production hardening и
операционные runbooks находятся в документах выше.

## Moderation / Admin development

Рабочие области доступны по `/moderation`, `/moderation/listings`,
`/moderation/reports`, `/admin/users` и `/admin/audit`. Backend проверяет
persisted роли на каждом запросе; скрытая навигация не является контролем доступа.

Для локального bootstrap зарегистрируйте и подтвердите обычный аккаунт, затем:

```powershell
$env:DEV_ADMIN_EMAIL = 'admin@example.test'
npm run dev:grant-admin
```

Команда работает только при `NODE_ENV=development`, не принимает пароль, не
создаёт credential и пишет audit event. В production выдача ADMIN выполняется
отдельным операционным процессом, не через public registration.

Query-plan review moderation/admin очередей использует изолированную test DB:

```powershell
npm run infra:test:up
npm run moderation:plans
npm run infra:test:down
```

Он создаёт по 30 000 users/listings/reports/audit rows, выполняет `ANALYZE` и
проверяет фактически выбранные индексы. Локальное время не является production SLA.

## Geo/Search и query-plan review

Единый public search: `GET /api/v1/listings?type=VEHICLE|PART`; временно отсутствие
`type` означает `VEHICLE`. Public offset заменён cursor response
`{items, page: {hasNextPage, nextCursor}}`; seller/catalog offset API сохраняется.
`/cars` и `/parts` явно передают subtype, используют URL filters, explicit Apply,
load more и geolocation только по нажатию. Price range/sort требует currency; money —
exact minor-unit string. Старый public `GET /api/v1/parts/listings` удалён; detail и
seller mutations сохраняют Parts routes.
`GET /api/v1/search/listings/facets` вызывается отдельно для counts после всех filters.
`GET /api/v1/search/listings/map` принимает независимые `viewport` + `zoom` и те же
Cars/Parts filters. Ответ содержит максимум 500 `LISTING | CLUSTER` features и
`truncated`; legacy lone `bbox` временно остаётся viewport alias. Exact point не
возвращается: markers, cluster centers и bounds используют только publicPoint, а
distance остаётся kilometre bucket. `/cars` и `/parts` используют общий MapLibre
LIST/SPLIT/MAP UI; browser Near Me не пишется в URL/storage/logs.

```powershell
npm run infra:test:up
$env:NODE_ENV = 'test'
npm run migration:run
Remove-Item Env:NODE_ENV
npm run search:plans
npm run test:integration
npm run infra:test:down
```

`search:plans` компилирует test workflow, создаёт собственную DB на isolated test server,
генерирует 30000 Vehicle и 25000 Part offers, выполняет ANALYZE и
EXPLAIN (ANALYZE, BUFFERS) для list, geo и high/low/broad cluster queries обоих subtype. Не изменяет
configured dev/test DB; свою DB удаляет
в finally. Full node summary — ignored `.tools/search-plan-report.json`; console содержит
времена и выбранные indexes. Это development plan review, не production benchmark/SLA.
Текущие **двенадцать migrations** clean apply / rollback/reapply проверяются integration
suite вместе с нулевым ORM schema diff. Search migration добавляет partial publicPoint GiST; Parts migration переносит vehicle_id в subtype без смены Listing.id. Rollback с Part data намеренно блокируется.
Полные bounds, privacy, query plans и ограничения: [Search/Geo](docs/search-and-geo.md),
[Map](docs/map.md), [Map QA](docs/map-qa.md), [ADR 0006](docs/adr/0006-postgresql-postgis-search.md),
[ADR 0008](docs/adr/0008-server-assisted-map-clustering.md).

## Messaging и realtime

Buyer и seller используют единый Listing-scoped чат для Cars и Parts:
`/account/messages` и `/account/messages/[id]`. PostgreSQL хранит сообщения и
read watermark; `MESSAGE_CREATED` проходит через transactional outbox в
`NEW_MESSAGE`. Socket.IO использует access token только в handshake auth,
проверяет текущую session/account state и масштабирует user rooms через Redis.
Пропущенные события всегда восстанавливаются через HTTP history/inbox.

```powershell
npm run infra:test:up
$env:NODE_ENV = 'test'
npm run migration:run
Remove-Item Env:NODE_ENV
npm run messaging:plans
npm run test:integration
npm run infra:test:down
```

`messaging:plans` создаёт owned test database с 30 000 conversations и 300 000
messages и проверяет планы inbox, latest/older history, unread, conversation identity
и message retry dedupe.
Локальные времена являются development measurements. Контракты, гарантии и
privacy: [Messaging/Realtime](docs/messaging-and-realtime.md),
[QA](docs/messaging-qa.md), [ADR 0011](docs/adr/0011-realtime-messaging-transport.md).

Для локального realtime нужны API, Redis/PostgreSQL и engagement worker:

```powershell
npm run build --workspace @marketplace/api
npm run start --workspace @marketplace/api
npm run worker:engagement
```

`MESSAGING_MAX_BODY_CODE_POINTS` ограничивает Unicode code points сообщения;
`REALTIME_REVALIDATE_SECONDS` задаёт период повторной persisted-session проверки.
Production reverse proxy должен проксировать WebSocket Upgrade, а CSP `connect-src` —
разрешать настроенный `wss:` origin. Транспорт только WebSocket; Redis adapter не
требует sticky sessions, пока HTTP polling остаётся выключенным.

## Запчасти и общий кабинет

- Public catalog: `/cars`, `/parts`, `/parts/[id]`.
- Seller choice/forms: `/sell`, `/sell/car`, `/sell/part`.
- Mixed seller dashboard/detail: `/account/listings`, `/account/listings/[id]`.
- `POST /api/v1/parts/listings`, `PATCH /api/v1/me/part-listings/:id`;
  common owner read/lifecycle/media remain `/api/v1/me/listings/:id/...`.
- `npm run seed:catalog` seeds both small development catalogs idempotently;
  taxonomy is managed reference data, not schema-migration seed.
- Parts location is optional, price is per unit, manual mark-sold closes all
  remaining stock. OEM compatibility is seller-stated, not verified automatically.
- Existing isolated `test:integration` includes legacy migration preservation,
  safe rollback/reapply, Part workflows and real Media processing. No extra setup.
