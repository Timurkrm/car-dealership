# Browser E2E report

## Scope and environment

The production builds of the NestJS API and Next.js application are exercised
against an isolated PostgreSQL/PostGIS, Redis and MinIO Compose project. The
runner seeds deterministic users, Cars, Parts, media, favorites, saved searches,
notifications and conversations, starts all three workers and serves a local
MapLibre style. It never uses the development database or an external map/email
provider.

The supported automated matrix is current Chromium, Firefox and WebKit at a
desktop viewport, plus iPhone 14 and Pixel 7 emulation. Playwright emulation is
not real-device certification.

## Result

The final expanded matrix passed 26/26 tests in 57.8 seconds: 12 Chromium,
6 Firefox, 6 WebKit and one test on each mobile project. Its JSON, HTML report,
traces, screenshots and video-on-failure are retained as CI/manual-run artifacts.

| Scenario                                          | Chromium | Firefox | WebKit | Mobile |
| ------------------------------------------------- | -------- | ------- | ------ | ------ |
| Cars search, URL filters, map, detail             | Pass     | Pass    | Pass   | Pass   |
| Parts search, fitment and detail                  | Pass     | Pass    | Pass   | Pass   |
| Login and enumeration-safe errors                 | Pass     | Pass    | Pass   | n/a    |
| Favorites, saved searches, notifications          | Pass     | Pass    | Pass   | n/a    |
| Messaging history and send                        | Pass     | Pass    | Pass   | n/a    |
| Seller, moderation and admin workspaces           | Pass     | Pass    | Pass   | n/a    |
| Registration, verification, password reset/change | Pass     | Pass    | Pass   | n/a    |
| Near Me denial                                    | Pass     | n/a     | n/a    | n/a    |
| Security API/browser suite                        | Pass     | n/a     | n/a    | n/a    |

Every browser scenario installs listeners that fail on unexpected `pageerror`
and `console.error`. The local map style removes an unreliable external provider
from the gate. Navigation waits use observable URL/DOM state rather than fixed
sleeps.

## Accessibility

`@axe-core/playwright` scans `/`, `/cars`, `/parts` and `/login` against WCAG A,
AA and WCAG 2.1 AA rules. The completed Chromium run found no serious or critical
violations. Semantic role/name selectors also exercise keyboard-visible controls
through the normal browser interaction path. This automated result does not
replace a manual screen-reader and keyboard review.

## Defects found and fixed

- `AuthClient` passed native `fetch` as an unbound method in WebKit. The client now
  uses a safe wrapper, with a frontend unit regression.
- A list-to-detail click could lose to a pending catalog request. A navigation
  latch prevents stale state from replacing the selected detail route.
- Firefox could not resolve MapLibre's generated worker URL. The build now copies
  the pinned worker asset and sets its same-origin URL explicitly.
- Next.js route prefetch generated WebKit RSC console failures in account
  navigation. Those navigation links now disable prefetch.
- Session creation used the application clock for `last_used_at` while
  `created_at` used the database clock. A rare clock skew violated the session
  date constraint during login. Both values now come from the database clock,
  with a unit regression and a repeated integration/browser gate.

## Artifacts and commands

`playwright-report/`, `test-results/` and `qa-results/playwright-results.json` are
runtime artifacts and are ignored by Git. Use `npm run test:e2e:chromium` for the
PR gate and `npm run test:e2e` for the complete matrix.
