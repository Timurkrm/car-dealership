# Automotive Marketplace design system — UI-1 / UI-2 / UI-3 / UI-4

## Principles

Clean European Automotive Marketplace: light surfaces, graphite text, royal-blue
actions, restrained borders and elevation. Content, photographs and prices have
priority over decoration. Cars and Parts share the same foundation.

UI-1 establishes primitives and migrates representative auth/account/public
headers. UI-2 adds the global shell and marketplace homepage described below.
UI-3 establishes shared Vehicle/Part result cards. UI-4 unifies the Cars/Parts
Search workspace, filters and List/Map interaction. These stages preserve API
contracts, permissions, canonical filter semantics and map behavior. Feature
modules continue to own validation, submission,
authorization, data fetching and domain status labels.

## Architecture

The existing plain CSS architecture is retained; no CSS framework, component kit,
icon package or font download is introduced.

Load order in `apps/web/src/app/layout.tsx`:

1. MapLibre vendor CSS.
2. `styles/tokens.css`: semantic variables and responsive gutters.
3. `app/globals.css`: existing feature layouts.
4. `styles/foundation.css`: document defaults, legacy control bridge, auth/account
   foundations, focus and reduced motion.
5. `styles/primitives.css`: shared `ui-*` classes.
6. `styles/shell.css` and `styles/home.css`: UI-2 header/navigation and homepage.
7. `styles/results.css`: UI-3 result cards and grid/list layout.
8. `styles/search.css`: UI-4 workspace, filter drawer and map presentation.

Primitives live in `apps/web/src/components/ui/`. Import the specific file; there
is no application-wide client barrel. `Dialog` is the only explicitly client
component. Other components work in server-rendered markup and client forms.
Interactive callback props must come from a client feature. Native props and refs
are forwarded using React 19 conventions. No debug/showcase route ships to production.

Existing feature CSS is deliberately retained. Use tokens for new work and migrate
feature styles incrementally; do not use specificity escalation or copy entire
feature layouts into the design system.

## Colors

| Role                        | Token                                                                  | Value                             |
| --------------------------- | ---------------------------------------------------------------------- | --------------------------------- |
| Page                        | `--color-bg`                                                           | `#f6f8fb`                         |
| Surface / muted surface     | `--color-surface` / `--color-surface-muted`                            | `#ffffff` / `#eef2f7`             |
| Primary text                | `--color-text`                                                         | `#202b3d`                         |
| Secondary / muted text      | `--color-text-secondary` / `--color-text-muted`                        | `#4d5c70` / `#596a80`             |
| Decorative / control border | `--color-border` / `--color-border-strong`                             | `#dce3ed` / `#7a8ba1`             |
| Primary / hover / active    | `--color-primary` / `--color-primary-hover` / `--color-primary-active` | `#2456d6` / `#1946b8` / `#163992` |
| Success                     | `--color-success`                                                      | `#176341`                         |
| Warning                     | `--color-warning`                                                      | `#815000`                         |
| Danger                      | `--color-danger`                                                       | `#b42332`                         |
| Information                 | `--color-info`                                                         | `#2456a3`                         |

Semantic colors have corresponding soft backgrounds. Use strong borders for
controls and subtle borders for decorative separation. Text, icons and explicit
labels accompany semantic color. The foundation is light-only, including native
controls; no incomplete dark theme is exposed through OS preference.

## Typography

System sans stack: `system-ui`, Apple system, `Segoe UI`, sans-serif. This avoids
font requests, layout changes on font loading and font licensing dependencies.
Weights: 400 body, 500 labels, 600 headings/actions, 700 price.

At the default 16px root: display 36–52px, H1 30–40px, H2 24–30px, H3 20–24px,
body 16px, small 14px, caption 13px, price 20–24px. Sizes use rem/clamp; body
line-height is 1.6 and headings 1.2. Inputs remain 16px even inside small labels.
Prices use tabular numerals. Display typography is available as a token, not
automatically applied to existing catalog titles.

## Spacing

Use the 4px-based scale: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64px
(`--space-1` through `--space-16`, explicit entries in tokens.css).
Fields use 8px internal gaps; controls 8px/12px padding; section/page gaps use
24–32px. Avoid new isolated magic-number spacing in reusable components.

## Radius

Small controls 10px, medium alerts 12px, cards 16px, dialog 20px; pills are
reserved for badges/chips. These values are tokens, not separate feature themes.

## Elevation

`--shadow-sm` separates cards subtly. Interactive cards add `--shadow-md` on
hover. Only modal dialogs use `--shadow-dialog` and a dimmed backdrop. Focus uses
an outline, never a shadow alone. Normal inputs and page headers are flat.

## Buttons

`Button` variants: primary, secondary, outline, ghost, danger. Sizes: sm 36px
(44px on mobile), md 44px, lg 52px. `IconButton` requires a readable `label` and
has a 44px target. Six local decorative SVG icons cover search, close, check,
info, warning and arrow; do not duplicate SVG paths in feature modules.

Default `type` is **button**; forms must explicitly use `type="submit"`.
`loading` disables interaction, sets `aria-busy` and overlays a spinner while
retaining the original label in layout and the accessibility tree. Keep the
label unchanged during loading to preserve width and accessible name. Do not
replace buttons with clickable divs. Navigation remains a link.

## Inputs

`Input`, `Textarea`, `Select` accept native props plus optional `label`, `hint`,
`error`. Visible labels connect through an explicit or generated unique id.
Hints, field errors and feature-supplied descriptions compose `aria-describedby`;
an error sets `aria-invalid`. Native required, disabled and readOnly remain
authoritative. Placeholder is supplemental text, never the only label.

```tsx
<Input
  label="Отображаемое имя"
  name="displayName"
  autoComplete="name"
  required
  hint="Имя, которое увидят другие пользователи."
  error={fieldError}
/>
<Button type="submit" loading={busy}>Сохранить</Button>
```

`Checkbox`, `Radio`, `Switch` use native inputs with visible labels. Radio groups
use a shared name and a feature-owned fieldset/legend. Switch exposes role=switch.
`SearchInput` is a labelled search field with a decorative icon positioned against
the input, so multiline labels do not move the icon. Primitives do not implement
business validation or silently change server constraints.

## Chips

`Chip` is passive metadata. `FilterChip` either toggles with `selected` and
`aria-pressed`, or removes a filter with `removable` and a required `removeLabel`.
Selection adds a check icon. The feature owns canonical filter/URL behavior.

## Badges

`Badge` and `StatusBadge` support neutral/info/success/warning/danger tones.
StatusBadge includes a dot and visible text, without an unnecessary live region.
`features/listings/listing-status-badge.tsx` maps shared VEHICLE/PART lifecycle
statuses to tones and existing Russian labels; the primitive has no domain imports.

## Cards

`Card` supports default, selected and interactive variants. Interactive requires
an href and renders Next Link; do not nest additional interactive elements inside
it. Selected includes visually hidden selection text. `Divider` is a native hr.
This stage does not replace marketplace listing cards with a new product layout.

## Loading

`Spinner` and `Skeleton` are decorative/aria-hidden. `LoadingState` combines a
live status message with skeleton lines. Features retain abort/retry/data loading
ownership. Reduced motion removes both spinning and pulsing animation.

## Empty/Error

`EmptyState` provides heading, description and optional primary/secondary actions.
Empty results are not errors. `ErrorState` combines readable feedback and an
optional native retry button. `Alert` supports info/success/warning/error; errors
use role=alert, other feedback role=status. Do not announce static badge metadata.
Existing safe feature error mapping remains responsible for user-facing messages.

## Accessibility

All interactive elements use consistent 3px focus-visible outlines with 3px
offsets; map vendor controls use inset focus to avoid clipping. Native labels,
required/disabled state, semantic headings, skip link and existing accessible
names are retained. No essential text is conveyed by color or icons alone.

`Dialog` uses native `showModal()`: a top-layer modal with inert background,
labelled title/optional description, explicit close button, Escape handling,
Tab/Shift+Tab containment, scroll lock and focus restoration to the trigger.
Pass `returnFocusRef` for pointer-opened dialogs: Safari does not automatically
focus clicked buttons. The security screen records the clicked trigger explicitly.
Keyboard-opened dialogs can also fall back to the previously active element.
`ConfirmationDialog` initially focuses Cancel. The feature closes the controlled
dialog and runs the existing command only after confirmation. Outside clicks do
not confirm or dismiss destructive actions. Nested dialogs are not supported in
this stage; open one dialog at a time.

Token contrast is checked in unit tests; real pages and the modal are checked with
axe WCAG A/AA and keyboard browser scenarios. Automated checks complement visual
review; they are not a complete assistive-technology certification.

## Responsive rules

Container widths: public 90rem, content 75rem, form 44rem. Gutters: 16px below
48rem, 24px from 48rem, 32px from 64rem. Layouts wrap without fixed heights;
long labels and headings remain readable. Dialog height is bounded to the viewport
and scrolls internally. Mobile actions have at least 44px targets.

The existing map 760px, sessions 44rem and admin 640px layout breakpoints remain
feature-owned for compatibility. UI-1 does not change the map's JavaScript
breakpoint or URL state. Future migrations should use the common 48rem/64rem
breakpoints where they do not conflict with established feature behavior.

## Density

`Container` supports `density="public" | "account" | "compact"`: panel padding
32/24/16px respectively. Public pages prioritize reading space, account forms a
moderate density, future workspaces compact presentation. Density never reduces
control hit targets or removes labels. Existing admin tables are not redesigned.

## Migration and verification

Migrated: authentication forms, account landing/profile/security, account logout,
engagement boundary feedback, shared listing errors/status badges, public home
header. Legacy controls receive the token foundation without changing handlers.

Not migrated: new global navigation/home composition (UI-2), catalog/card/detail
layouts, map UI, messaging composition and admin/moderation tables. Existing
window.confirm uses outside account security remain for later feature migrations.

The paragraph above records the UI-1 boundary. Global navigation and Home are
subsequently migrated by UI-2, described below.

Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`,
`npm run test:e2e`. `e2e/design-system.spec.ts` adds representative page axe and
screenshots on Chromium/iOS/Android, a 720px CSS viewport equivalent to 200%
desktop zoom reflow (without automating the browser toolbar), modal
keyboard/action tests across Chromium/Firefox/WebKit, and loading/error/reduced
motion/long-label tests. Existing critical functional tests remain in the matrix.
Screenshots go to ignored `test-results/`; the HTML report is `playwright-report/`.
No production debug route or screenshot assets are shipped.

### UI-1 verification — 2026-10-03

- Backend unit/HTTP: 73 passed; frontend: 82 passed, including 12 design-system
  tests for semantics, field associations, state and token contrast.
- Playwright: 36 passed, zero skipped/flaky/failed, across Chromium, Firefox,
  WebKit, iPhone 14 and Pixel 7 emulation; development run duration 108.7 seconds.
- Axe: zero serious/critical findings on login, register, home, Cars, Parts,
  account, profile, profile error state and the confirmation dialog.
- Visual review: seven representative pages on desktop and both mobile projects;
  focus, confirmation, long button label and error screenshots. Horizontal reflow
  checks also run at a 720px desktop CSS viewport (200% zoom equivalent).
- Production build, lint, typecheck, unit suites and documentation link check pass.
  E2E provisions/migrates/seeds its isolated database and removes its containers,
  network and volumes on completion.
- New foundation CSS source: 20,262 bytes, 4,113 bytes gzip (tokens + foundation +
  primitives). This is a source-size measurement, not a route JavaScript bundle
  comparison. No package or external font dependency was added.

Visual QA found and corrected stretched grid controls and checkbox labels in the
existing Parts form. Cross-browser QA found and corrected Safari trigger-focus
restoration. The new UI suite uses the existing second-seller fixture to avoid
exhausting the buyer's real authentication rate limit; no security limit is
disabled or raised. Generated Playwright artifacts are excluded from source lint
and formatting, matching their existing Git exclusion.

Known limits: device emulation is not physical-device testing; 200% reflow is
tested through CSS viewport dimensions, not browser toolbar interaction. Native
select/checkbox rendering still differs between browser engines. No full screen
reader audit, dark theme or nested-dialog system is claimed.

## Global Shell

UI-2 keeps the root layout and `PublicShell` server-compatible. AuthProvider and
RealtimeProvider remain the existing persistent providers. The shell renders the
skip link, shared Header and page children; each page retains its own single
`main#main`, including Account and Admin. No duplicate main landmark or new
routing system is introduced. A small footer on Home links only to existing
Cars, Parts and Sell routes. Development diagnostics are no longer Home content.

`styles/shell.css` and `styles/home.css` follow the UI-1 styles in the root import
order. Header-specific tokens define height and stacking: header layer 20, skip
link 30; modal Dialog uses the native top layer. Map's sticky panel offset includes
the header height; map queries, URL semantics, canvas dimensions and breakpoints
are unchanged.

## Header

Desktop (from 64rem): Automotive Marketplace mark, equal Cars/Parts links, Sell,
then authenticated Favorites/Messages/Notifications/Account or anonymous
Login/Register. Height is 72px with a solid surface and subtle border. Display
name is truncated; below 80rem the account icon keeps the layout compact.

The persistent GlobalHeader is the client boundary for pathname, auth, unread
state and drawer controls. The root layout, home composition and latest data
remain server components. Account links directly to `/account`; no new dropdown
framework is added. Privileged links remain in the account navigation and mobile
menu with existing role checks. Backend authorization remains authoritative.

Loading auth displays a fixed-width skeleton rather than anonymous links.
Unavailable auth offers retry through the existing client. Login, register,
forgot/reset password and verification routes use a simplified mark + Home link.
Auth forms and session lifecycle remain unchanged.

## Mobile Navigation

Below 64rem the 64px sticky header shows the short Automotive mark, Favorites
when authenticated and a labelled menu button. Its `aria-expanded` and
`aria-controls` reference the shared Dialog drawer.

Drawer order: Cars, Parts, Sell; then personal routes and My Listings/Account/
Saved Searches; privileged workspace links and existing Sign out action. Anonymous
users see Login/Register. Items have at least 44px targets and wrap long text.

Dialog gains optional `variant="drawer"`, `id` and `closeOnBackdrop`. Default
confirmation behavior is unchanged. Drawer closes on link activation, Escape,
outside pointer click, explicit close, browser back/forward, or resizing to the
desktop breakpoint. Body scroll is locked; focus returns to the menu trigger,
including Safari. Backdrop dismissal requires both pointer start and click outside
the dialog rectangle, so dragging content does not accidentally close it.

## Homepage Composition

Compact hero and quick search; two equal category cards; Latest Cars and Latest
Parts; a factual Sell strip and minimal footer. No invented counts, testimonials,
ratings, stock images or homepage map are introduced. Product title/description
are updated to Automotive Marketplace.

Each latest section streams independently through Suspense. Server transport
calls existing `GET /api/v1/listings` with explicit `type=VEHICLE` or `type=PART`,
`sort=newest`, `limit=4`. It uses the configured API origin, existing allowlisted
response parser, a six-second deadline, no redirects and `cache: no-store`.
Browser cookies, access tokens and forwarded headers are never sent by this
public server fetch. Results are not cached across requests, so URLs/media and
publication state are refreshed on navigation/reload.

One failed request yields a safe local ErrorState with a catalog link; the other
section and category entrypoints remain usable. Empty results have a real empty
state and Sell action. Skeletons reserve card/media space while loading. The
existing SearchCard is reused with optional h3 and media fallback slots. Home
only supplies grid/surface/spacing and a 4:3 image ratio; no card anatomy or
favorite semantics are redesigned. Below-fold images retain native lazy loading.

## Navigation Rules

Cars is active for `/cars`, its descendants and existing `/listings/:id` vehicle
detail routes. Parts is active for `/parts` and its descendants. Prefix matching
requires a path boundary. Active links have `aria-current`, stronger weight and
an underline in addition to color. Sell always uses the existing `/sell` chooser
and existing authentication behavior on subsequent seller routes.

Quick search is deliberately small: Cars accepts optional `yearFrom`; Parts an
optional `partNumber` (OEM/manufacturer number). It reuses existing category
validators and `serializeSearchParameters`; blank input opens the category
catalog. It does not implement free text, geocoding or automatic geolocation.
Other filters remain in the existing catalogs.

New shell/category/CTA links disable route prefetch to preserve the existing
WebKit/protected-navigation policy. UI-3 applies this policy to result card links.

## Unread Badges

`useUnreadCounts` replaces the former EngagementNavigation fetch/subscription
owner. GlobalHeader invokes it once and passes the same result to desktop and
mobile links. It reuses EngagementClient, MessagingClient and the shared
RealtimeProvider; no extra Socket.IO connection or polling interval exists.

The two existing `/me/notifications/unread-count` and
`/me/conversations/unread-count` endpoints reconcile on login, reconnect, relevant
notification/message events and window focus. Events are briefly coalesced and
overlapping reconciliations do not run concurrently. Route changes alone do not
reload counts. Requests abort on identity change/unmount; old-principal state
cannot populate another account's header. Failed count requests show no badge.

Visual and accessible count is bounded at `99+`; zero/unknown is omitted. Link
names include unread information. Badges are hidden from the accessibility tree
because the parent link already describes them; no additional live announcement
duplicates the notification center.

## UI-2 verification workflow

`shell-home.test.ts` covers category active state, auth route selection, badge
semantics, canonical quick search, bounded public requests, partial failure and
empty/loading states. `shell-home.spec.ts` exercises Home across all five browser
projects, anonymous navigation, quick-search URLs, drawer keyboard/backdrop and
breakpoint closure, sticky behavior, auth loading and axe.

Existing signed-in design-system scenarios additionally check personal routes,
long names, bounded badges, open-drawer axe, and no duplicate socket/count
requests on SPA navigation. They reuse existing fixture logins so production
authentication rate limits remain enabled. The visual suite supplies a controlled
Socket.IO transport because its direct Next server has no WebSocket proxy; the
existing production-proxy journey owns real network transport coverage.

Empty/error server-section cases are tested with injected transport in unit
tests. `home-states.spec.ts` also renders the actual server components through
the normal React test compilation and checks their desktop/mobile layout and axe
in Chromium, including loading placeholders. This is isolated component-state
coverage, not an injected outage of the running API. No production debug endpoint
or test-only public API is introduced.

Home quick-search submission reads FormData from the real field, preserving early
input that arrives before React hydration. Browser scenarios assert filter values
while allowing the existing catalog to append its map viewport URL parameters.
Initial unread reconciliation starts immediately; event bursts remain coalesced.

Additional UI-2 CSS source (`shell.css` + `home.css`) is 9,859 bytes, 2,035 bytes
gzip. This is a source-size observation, not a JavaScript bundle delta or a
production performance guarantee. No new package, font, icon framework or map
instance is added to Home.

The development production build's client-reference manifest lists three layout
entry chunks totaling 95,807 bytes raw / 29,562 bytes gzip, and four Home entry
chunks totaling 129,971 bytes raw / 41,862 bytes gzip (including those layout
chunks). These include existing auth/realtime and shared code; they are neither
an isolated Header cost nor the complete browser transfer including framework
runtime. A before/after JavaScript bundle delta was not measured.

## UI-2 verification results

Executed on 2026-10-04:

- `npm run lint`: PASS, including module boundaries and formatting.
- `npm run typecheck`: PASS, both workspaces.
- `npm test`: PASS, 73 backend tests and 90 frontend tests (eight new UI-2 cases).
- `npm run build`: PASS, executed by the full E2E workflow for both workspaces.
- `npm run test:e2e`: PASS, 43 tests across Chromium, Firefox, WebKit, iPhone 14
  and Pixel 7 projects. New Home/header and isolated state scenarios are included.
- `npm run docs:check`: PASS. Literal ellipsis-only forbidden-path examples in
  repository guidance are recognized as placeholders; real Windows paths and
  file URIs are still rejected (verified with temporary negative probes).

Checked routes include `/`, `/cars`, `/parts`, `/sell`, `/sell/car`, `/login`,
`/register`, `/account`, `/account/profile`, personal entrypoints and existing
critical marketplace journeys. Screenshots cover anonymous/authenticated header,
long names, `99+`, mobile drawer, Home and section states. Tested states have
zero serious/critical axe violations. Browser errors remain asserted in the
app journeys; the existing anonymous refresh 401 is an expected auth probe.
The E2E workflow applied migrations and seeded its isolated database, then
removed its containers, volumes and network. UI-2 adds no schema migration.

Limitations: mobile coverage uses emulation; no physical-device or full screen
reader audit is claimed. Section outage/loading visuals are isolated browser
fixtures plus injected-transport unit tests. LCP/CLS and a before/after bundle
delta were not measured. Vehicle/Part card anatomy, Search/Map, detail, seller
forms, Messaging and Admin/Moderation redesign remain separate UI stages.

## Marketplace Result Cards (UI-3)

UI-3 replaces the former SearchCard and duplicate Favorites presentation. Home,
Cars, Parts and Favorites now share the result shell, media, price and spacing.
The preceding UI-2 results are historical; card anatomy is implemented below.
Seller account summaries keep their existing lifecycle-oriented presentation.

`features/results` owns ResultCardShell, ResultLayout, ResultMedia, formatting,
VehicleCard and PartCard. MarketplaceResult dispatches the discriminated Search
DTO exhaustively. FavoriteResult adapts the smaller existing Favorites DTO
without requesting details or fabricating missing fields. Backend contracts,
publication rules, pagination and canonical search semantics are unchanged.

The shell, metadata and Home composition remain server-compatible. Small client
boundaries handle image failures, card interaction and the favorite action;
interactive catalog parents retain their existing client rendering. Card links
disable speculative route prefetch. There are no new dependencies, sockets,
polling loops or per-card reads.

## Vehicle Card Anatomy

The public Listing title is the linked heading, followed by price, year/mileage,
fuel/transmission and available public location. Vehicle enum labels reuse the
existing form vocabulary, now in vehicle-labels.ts. Optional metadata is omitted.
No body specifications are invented from the title or make/model names.

## Part Card Anatomy

The public title and per-unit price lead. Optional brand and canonical condition
follow. OEM number and manufacturer part number have distinct labels; absent
numbers are omitted. Available quantity is an offer attribute, not a root Listing
attribute. The card reads the existing Part projection without reinterpretation.

## Grid/List Variants

ResultLayout and both typed cards support `grid` and `list`. Grid uses bounded
minimum widths and equal row stretch. Desktop list places media beside the body;
below 768px it stacks vertically. Grid is used on current public surfaces. List
is available and tested for the subsequent workspace stage, without introducing
new Search/List/Map controls. No speculative compact or popup mode is added.

## Media Rules

ResultMedia displays one existing public cover variant, with intrinsic dimensions,
lazy loading and a reserved 4:3 grid frame. Vehicle images use cover; Parts use
contain to retain the complete object. Desktop list media fills its left column.
Missing or failed images use a neutral icon/text placeholder. A changed cover URL
can recover from a previous URL failure. Galleries and storage keys are not read.

The existing presigned-image strategy uses Next Image with `unoptimized`. The
component supplies layout sizes, but Next omits responsive srcset/sizes under
that strategy: the API-provided cover resolution remains the actual source.
This stage does not claim automatic responsive image selection or introduce a
new image proxy. Fresh search loads retain the existing URL-expiry behavior.

## Price Hierarchy

Price uses the shared price typography token and explicit currency code. Formatting
uses existing minor-unit conversion and BigInt grouping, never floating-point
money. Fractional digits follow existing currency semantics. Part prices visibly
include `/ шт.`. Large values can wrap within the card without horizontal overflow.

## Favorite Action

An independent 44px action overlays media; it is a sibling of the title link, not
a button nested in a link. Anonymous users follow the existing sign-in return
flow. Authentication loading disables the action. Pending mutations disable repeat
activation; failures restore the previous observation and display safe feedback.

FavoriteProvider owns a principal-scoped in-memory FavoriteState. Cards for the
same Listing share confirmed observations and optimistic mutations. Existing
Favorites page responses seed positive membership. Logout/identity changes use
a new store; credentials and membership are not persisted in browser storage.

The existing API has no batch membership projection. An unobserved listing remains
unknown (no false `aria-pressed` claim); its action performs an idempotent add.
Already-saved membership is known after observing Favorites or a successful local
mutation. Cross-tab membership reconciliation is not introduced. This preserves
bounded traffic rather than fetching membership separately for every card.

Favorites retains safe UNAVAILABLE tombstones and SOLD badges. A tombstone exposes
no former title, image, price or detail link. Available favorite metadata uses only
its compact DTO; missing location, fitment, stock or brand stays absent.

## Location

Cards render public city/region and the already privacy-rounded distance through
the existing distance formatter. They do not render coordinates or derive new
distances. Missing publicPoint never falls back to exactPoint. VIN, seller private
data, moderation notes, storage keys and optimistic versions are not presented.

## Compatibility Presentation

UNIVERSAL is explicit. Vehicle-specific fitment shows the first bounded sample
(make/model, optional generation and year interval), with an additional-scope count
where available. Missing samples fall back to the existing count or omit the line.
The label “По данным продавца” preserves seller-declared provenance; the UI does
not certify compatibility or duplicate normalization logic.

## Selected State

Controlled `selected` and `hovered` props style the card, with a non-color border
and accessible selected description. Existing `listing-card-{id}`, onSelect and
onNavigate hooks remain usable by the current map integration. Optional onHover
does not create global selection state. UI-3 does not change MapLibre behavior.
List-origin selection updates the selected ID without moving keyboard focus.
Marker-origin selection retains scroll/focus to the card; this prevents the
pre-existing map selection handler from stealing focus from card controls.

The heading is a semantic internal link whose stretched hit area covers the card.
Keyboard order is title then favorite. Focus-visible outlines cover the card and
the separate action; favorite activation does not navigate. Home uses h3 under
section h2; catalogs use h2. Full titles remain available to assistive technology
despite two-line visual clamping. No nested interactive controls are introduced.

## Responsive Rules

Grid becomes one column on narrow phones, two on intermediate widths and three
or four where the container permits. List stacks on mobile. Media, long titles,
large prices and part numbers stay within their columns. Shared skeletons reserve
card/media space. Catalog empty states reuse EmptyState and a real reset action;
existing error/retry behavior is retained. Motion honors reduced-motion settings.

## UI-3 Verification

Unit tests cover explicit subtype dispatch, exact money, absent optional data,
compatibility, stock, safe title escaping, private-field omission, unavailable/SOLD
Favorites and mutation deduplication/rollback. Browser coverage exercises actual
public navigation and favorite controls, image-error recovery, and isolated actual
component renders for grid/list edge states. Isolated renders test layout/a11y;
hydrated application journeys separately test interaction.

The UI-3 results stylesheet is 5,738 bytes raw / 1,429 bytes gzip. This measures
CSS source only, not total browser transfer or a JavaScript bundle delta. Existing
gallery/media APIs are not called per card; browser checks assert zero Favorites
membership reads while using the catalog and one PUT for repeated pending clicks.
No LCP/CLS, physical-device or full screen-reader audit is claimed.

### UI-3 verification results

Executed on 2026-10-04 against the final implementation:

- `npm run lint`: PASS (ESLint, module boundaries and Prettier).
- `npm run typecheck`: PASS, both workspaces.
- `npm test`: PASS, 73 backend and 101 frontend tests, including 11 new card/state
  tests. Existing Search, auth, map and engagement cases remain included.
- `npm run build`: PASS as an explicitly executed separate gate, both workspaces.
- `npm run test:e2e`: PASS, 51 tests across Chromium, Firefox, WebKit, iPhone 14
  and Pixel 7 projects. No tests were skipped. Public Cars/Parts detail navigation,
  anonymous sign-in links, authenticated favorite keyboard/pending behavior and
  broken-media recovery pass. Browser errors are asserted in app journeys.
- `npm run docs:check`: PASS.

Grid/list edge fixtures cover 320, 375, 390, 768, 1024 and 1440px in Chromium and
the mobile projects' device widths. Checked states have no horizontal overflow or
serious/critical axe violations. Desktop/phone screenshots were inspected; list
media columns align despite differing Part metadata lengths. The first run caught
a map-selection focus regression and an incorrect test fixture ID; both were
fixed before the complete passing rerun.
Isolated fixtures explicitly set the mobile viewport meta tag and assert the
actual CSS viewport width, avoiding a scaled desktop layout in mobile emulation.
Repeated WebKit runs also exposed cancelled speculative RSC requests from the
existing Part detail back-link and Sell chooser links. Catalog back-links for both
listing types and Sell chooser links now use the
same explicit-navigation/no-prefetch policy as the shell and cards. Their page
design and business behavior are unchanged; browser error checks remain enabled.

The isolated E2E workflow builds the apps, applies migrations, seeds fixtures and
tears down its containers, volumes and network. UI-3 introduces no API contract,
database migration or dependency change. Server-compatible Home rendering is
retained. Search controls, workspace/map visual redesign, detail, sell forms,
Messaging and Admin/Moderation remain future UI stages.

## Search Workspace (UI-4)

Cars and Parts use `SearchWorkspace`, with subtype-specific `SearchFilters` and
`PartSearchFilters`. The existing SearchClient, parsers, validators, cursor coordinator
and MapSession remain the transport/state boundary. No backend query, DTO, migration,
search engine or dependency changes are introduced. Server route wrappers and metadata
remain intact; interactive search is client rendered as before.

## Filter Sidebar

Desktop filters occupy a 17rem sidebar. Forms maintain an unapplied draft and send one
request on Apply, never per keystroke. Canonical catalog IDs, dependent selections,
minor-unit money conversion and validation are reused. Make changes reset Model and
Generation; Model resets Generation, including Parts fitment filters. Vehicle enums
have readable labels and collapsible groups. Part categories display database-backed
parent paths with bounded/cycle-safe traversal; manufacturers are separate from vehicle
makes. Condition and fitment modes support the existing comma-separated multi-values.

## Mobile Filters

Below 1200px, an explicit Filters button opens the shared native Dialog drawer. It
provides focus containment, Escape/backdrop dismissal, background scroll lock and
focus return to the actual triggering button (including Safari pointer activation).
Closing discards the draft; reopening starts from applied state. Show results validates,
applies and closes. Reset clears applied filters. The action area remains reachable at
the bottom with safe-area padding. No request runs for typing or checkbox toggles.

## Active Filter Chips

Chips represent applied state, not drafts. Reference labels use catalog/result names;
unknown references have a safe generic label instead of printing UUIDs. Enum values and
ranges are readable, and price rendering never converts minor units to floating point.
Removing a multi-value chip preserves the other values. Removing a parent also removes
its dependent children; removing currency clears price ranges/price sort; removing
location clears radius/origin/bbox/distance sort. Clear filters resets the complete query.
Exact browser coordinates never appear in chips.

## Results Toolbar

The toolbar shows only the number of loaded cards, not an invented exact total.
Sorting uses the existing allowlists: Cars newest/price/mileage/year/distance, Parts
newest/price/distance. Price options require currency, distance requires origin.
Changing sort resets cursor pagination. Save Search retains the existing authorization,
canonical filters, notification and private-origin restrictions and uses UI primitives.

## View Modes

Desktop offers List, Split and Map, with Split as the existing default. List uses UI-3
grid cards; Split uses UI-3 list cards. Mobile/tablet offer List and Map; a Split URL
renders as List without silently rewriting shared state. `view` and coarse camera
parameters remain outside filter fingerprints. Apply pushes history, camera movement
replaces presentation state; back/forward/reload restore canonical filters.

## Map Workspace

MapLibre remains dynamically imported, with one map instance retained across filter
and view changes. Features update through GeoJSON source `setData`; ResizeObserver
handles layout changes. Replaced styles recreate source/layers from current refs.
The sticky map respects the global header height. Attribution and native map navigation
remain present. Provider failure leaves List available and offers explicit style retry.
No automatic retry loop or new geocoding/provider integration is introduced.

## Markers

Markers use publicPoint exclusively. Semantic colors distinguish Cars and Parts;
selected and hover outlines use separate source/layers. There is no React DOM marker
per result and no fallback from a missing public point to a private coordinate. Existing
compact public previews reuse UI-3 media, money and location presenters.

## Clusters

Clustering remains server-assisted over the full filtered viewport before the feature
limit, not over a client-truncated marker page. Existing count semantics and cluster
fit-bounds/zoom behavior are retained, including antimeridian and reduced-motion handling.
This UI stage does not modify cluster SQL or add client clustering.

## Selected/Hover States

Hover and selection are separate listing-ID states scoped to the current query. Card
hover updates only a visible map feature, never pans the map, and clears on leave.
Keyboard focus selects the corresponding listing. A marker selection scrolls a loaded
card into view in Split without stealing focus; otherwise the compact preview is enough.
Selection/hover whose ID is absent from both projections is not rendered. No extra
pages are fetched to manufacture an out-of-viewport marker or card.

## Search This Area

Panning changes the map projection and coarse camera URL, not applied search bbox.
The CTA appears after meaningful movement relative to the initial/applied viewport
(2% of each extent, with a small rounding tolerance; wrapped longitudes supported).
Applying it promotes bounds to bbox, removes origin/radius/distance sort, resets the
cursor and hides the CTA until the viewport changes again. Viewport requests are
225ms debounced, identical keys are deduplicated, and obsolete responses are ignored.

## Near Me

Only an explicit button requests browser location. Successful coordinates remain in
React memory and become search input on Apply; they never enter URL, SavedSearch,
localStorage or sessionStorage. Camera serialization is also disabled while private
origin is active. Permission denial, unavailability and timeout are ordinary feedback.
Late geolocation after closing/resetting the form is ignored. Explicit area search
replaces the private origin with a public, shareable viewport. Distance formatting uses
only the backend-rounded public distance, including the `< 1 км` bucket.

## Map Loading/Error/Truncated

Map refresh shows a small progress indicator while retaining previous features.
Map errors and facet errors are independent of the list. Retry is explicit, with safe
429 feedback and no automatic loop. Truncated responses ask the user to zoom or narrow
filters and never imply all markers are shown. List loading uses UI-3 skeletons; cursor
append keeps existing cards; empty state offers reset. An invalid/mismatched cursor
refreshes the first page once, then surfaces a normal error if that fetch fails.

## Responsive Search Rules

The 1200px breakpoint avoids squeezing filters, cards and map into three narrow columns.
The desktop page has one document scroll; the map is sticky, not another scrolling
results container. Mobile drawer is the intentional separate scroll surface. Toolbar,
chips and range fields wrap without horizontal page overflow. Search tokens reuse UI-1
colors, spacing, control sizes, header offsets and layers; only sidebar width and map
layer context are local. Individual map points are not a screen-reader navigation tree:
List is the accessible alternative. No full assistive-technology or physical-device
performance audit is claimed.

## UI-4 verification — 2026-10-06

Executed separately on Windows with repository Node 24.21.0:

| Command              | Result                                                     |
| -------------------- | ---------------------------------------------------------- |
| `npm run lint`       | Passed ESLint, module boundaries and Prettier              |
| `npm run typecheck`  | Passed API and Web                                         |
| `npm test`           | 73 backend and 108 frontend tests passed                   |
| `npm run build`      | Passed API and Next production builds independently of E2E |
| `npm run test:e2e`   | 69 passed, 4.0 minutes of browser tests                    |
| `npm run docs:check` | Markdown link/path audit passed                            |

Browser coverage includes Chromium, Firefox and WebKit desktop, iPhone 14 and
Pixel 7 emulation. The responsive matrix covers 320, 375, 390, 768, 1024 and 1440px.
UI-4 scenarios exercise draft/apply, dependent catalog reset, URL history/reload,
chips, currency/sort, opt-in facets, opaque cursor/deduplication, both category maps,
cluster expansion, hover/selection, explicit area search and ephemeral Near Me.
Mobile scenarios cover drawer Escape/focus return, discarded drafts, Apply,
location denial and switching to an already-loaded map. Axe found no serious or
critical violations in checked List, Split, Map and drawer states. Segmented view
buttons change foreground/background atomically to retain contrast during selection.

Screenshot review covered both category workspaces, filter combinations, skeletons,
empty results, 429 feedback, truncated map feedback, selection, mobile filters,
location denial and Near Me. Additional local browser checks preserved the same
canvas element over three List/Map cycles for each category. These are bounded
checks, not a heap-growth proof or a physical-device performance certification.

The E2E runner now launches Playwright asynchronously: its previous synchronous
child blocked the parent event loop serving the local map style, so visibility of
the map container alone could pass while MapLibre never rendered. The regression
now clicks actual rendered clusters/markers with the local style server responsive.
The E2E fixture intentionally uses a plain background rather than external tiles;
production provider availability, quota and visual cartography require staging QA.

`search.css` measures 7,487 source bytes / 1,668 gzip bytes locally. This is the
workspace stylesheet size, not the net compiled CSS or JavaScript bundle delta.
No new dependency, polling loop, per-card fetch or map instance per filter change
was added. Search requests are Apply-driven; map requests are debounced/deduplicated;
facet requests are explicit. Full heap profiling and Lighthouse were not run.

Evidence is stored locally in ignored `qa-results/ui-4-*.log`,
`qa-results/ui-4-regression.json` and `qa-results/ui-4-visual/`. Backend Search SQL,
API contracts and schema were unchanged, so `search:plans` was not rerun for UI-4.
The E2E project containers, volumes and network were removed and verified absent.
UI-5 remains a separate stage.
