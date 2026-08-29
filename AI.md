# Impact System — AI Handoff

Last updated: 2026-08-29

## Repository and deployment state

- Repository: `git@github.com:RCS-Projects/impact.git`
- Branch: `main`
- Latest pushed commit: `7413f15 Fix polygon mapping and admin workflow reliability`
- Local Docker stack: `docker-compose.yml`, with `app` and PostGIS `db` services.
- App is published locally on `192.168.120.7:3000`; the public hostname has previously been routed to this machine through Cloudflare Tunnel.
- The local image is built with `GIT_COMMIT=7413f15`; `/api/version` reports the commit and build timestamp.
- One local, intentionally untracked file remains: `docs/current-status-audit.md`. It was not committed because it contains stale claims and raw temporary-credential references. Review or replace it before ever committing it.

Do not place passwords, tokens, private URLs, production database values, or raw coordinates in this file, tests, logs, screenshots, or committed fixtures.

## Architecture

- Next.js 15 App Router with strict TypeScript.
- PostgreSQL 16 + PostGIS 3.4.
- Route handlers are thin; services own business rules; repositories own SQL.
- MapLibre GL renders public incident maps and geometry pickers.
- Public/private point locations are structurally separated: exact submitted point data is in `report_private_locations`; public queries use public projections.
- Incident boundaries (`reporting_area`) and public report polygons (`report_geometry`) are different concepts.
- All public incident maps use permanent direct URLs: `/map/{slug}-{publicId}`. The root page is informational only.
- Uploads are stored on the Docker upload volume and are decoded/re-encoded with Sharp before storage.

## Geometry behavior implemented

Incidents support these geometry modes:

- `point`
- `polygon`
- `point_or_polygon`

Important implementation details:

- Existing point reports remain point geometries after migration `004_report_geometry.sql`.
- Report geometry is stored in PostGIS SRID 4326.
- Reporting boundaries are validated as closed GeoJSON Polygon/MultiPolygon data by `src/server/schema/incident-schema.ts`.
- Report polygons are validated by `src/server/schema/report-geometry.ts`, plus PostGIS validity/boundary containment checks in the repository layer.
- Public map points and polygons are separate MapLibre sources/layers.
- Point clustering applies only to points. Polygon reports render independently and can be selected.
- Polygon reports are public as drawn. They do not show a 500-foot privacy circle.
- Polygon reports now derive their stored display anchor from the polygon bounds rather than inheriting the incident centre. Their server-side privacy state is recorded as exact/public geometry, while point reports retain exact/approximate behavior.

### Polygon editor fixes in `7413f15`

`src/components/admin/polygon-editor.tsx` was rebuilt to fix the reported map/editor failure:

- Keeps an open ring only while editing and emits a canonical closed GeoJSON ring to parents.
- Supports Draw, Undo, Finish, Cancel, Clear, and Edit boundary.
- Disables map panning only while actively placing points.
- Shows draggable vertex handles only in edit mode.
- Uses `ResizeObserver` and corrected picker CSS to prevent a MapLibre canvas from appearing in the top-left of the page.
- Supports geocoded Polygon and MultiPolygon boundary results.
- City/place boundary lookup is debounced and cancels stale requests with `AbortController`.
- A MultiPolygon can be saved intact; manual vertex editing is deliberately limited to a single Polygon and the UI explains that limitation.

`src/components/report/report-geometry-picker.tsx` provides the public touch-friendly polygon workflow with Draw again, Cancel, Undo, Clear, Finish, Edit boundary, and Start over controls.

## Public-report flow

`src/components/report/report-form.tsx` is geometry-aware:

- Point reports: Location → Privacy → Incident details → Review.
- Polygon reports: Location → Incident details → Review.
- Polygon reports explicitly state that the submitted search area is public and not fuzzed.
- Point approximate privacy remains a stable randomized public pin within 152.4 metres/500 feet; exact coordinate stays private.
- Private owner-edit links support both point and polygon report updates/deletion.
- Existing photos are retained during edits unless replaced.
- Success sharing uses the public map URL, not the private edit URL.

`src/components/map/incident-map-view.tsx` now:

- Avoids rendering privacy circles for polygons.
- Fits a selected polygon from the report list.
- Displays public-area wording for selected polygons.
- Displays an actionable Retry control when report refresh fails.

## Admin and template behavior

- Admin dashboard creates incidents from reusable templates and can select point/polygon/mixed report modes.
- Incidents can be published, closed, archived, duplicated, and deleted when not live.
- Reporting boundaries can be drawn, pasted as GeoJSON, or populated from city/place outline search.
- Template PATCH accepts a nullable description. This fixed a real save failure when templates had no description.
- Admin incident/template routes now reuse the canonical `incidentFormSchema` rather than maintaining duplicated field schemas.
- `src/components/admin/form-builder.tsx` uses stable internal editor identities while a field key is changed, including when it is temporarily empty. This prevents form cards/inputs from remounting and stealing focus while typing.
- The form builder has explicit expand/collapse controls; clicking into an input no longer collapses its card.
- Existing server-side schema-locking rules prevent published forms from removing/changing keys/types and prevent removal of choice values after reports exist.

## Uploads, privacy, and safety already present

- `src/server/lib/image-metadata.ts` uses Sharp to decode accepted JPEG/PNG/WebP bytes and re-encode canonical WebP without carried metadata.
- Upload ownership uses a browser claim token hashed at rest; report creation claims uploads transactionally.
- Client answers submit upload IDs; public file URLs are constructed server-side.
- Public report APIs do not join private-coordinate storage.
- Exact-location admin reveal and sensitive exports are separate, audited workflows.
- CSP uses request nonces; inline application styles were removed where possible.

## Operations and commands

Normal local deployment:

```bash
docker-compose up -d --build
docker-compose exec app npm run db:migrate
docker-compose exec app npm run db:seed
```

Useful checks:

```bash
docker-compose exec app npm run doctor
docker-compose exec app npm run smoke
curl http://192.168.120.7:3000/api/version
```

Useful test/build commands:

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

To embed deployment provenance in a Docker build:

```bash
GIT_COMMIT=<commit> BUILD_TIME=<ISO-8601-time> docker-compose build app
docker-compose up -d app
```

`npm run doctor` verifies database reachability, PostGIS, writable upload storage, and administrator count without printing secrets.

`npm run smoke` verifies health, readiness, root, admin page, and an SSE response.

## Verification performed for commit `7413f15`

Passed locally:

- `npm run format:check`
- `npm run lint`
- `npm run typecheck`
- `npm test`: 39 passed; 14 PostGIS integration tests skipped because no disposable `TEST_DATABASE_URL` was provided.
- Docker image build and app restart.
- `docker-compose exec app npm run doctor`.
- `docker-compose exec app npm run smoke`.
- Focused Playwright polygon report flow on Chromium desktop.
- Focused Playwright polygon report flow at 360×800 touch viewport.

Known test behavior:

- `tests/integration.test.ts` recreates the schema and now uses **only** `TEST_DATABASE_URL`; it will not fall back to `DATABASE_URL`.
- In CI, `TEST_DATABASE_URL`, `E2E_DATABASE_URL`, and `E2E_REQUIRE_ISOLATION=true` are configured.
- Do not point either test URL at the application database.
- `tests/e2e/global-setup.ts` removes only E2E-named incidents and temporary `e2e-field-*` templates from `E2E_DATABASE_URL`.
- The full cross-browser suite was not rerun after the latest changes because this workstation does not currently provide an isolated E2E database configuration to the host test runner. Configure one before treating E2E coverage as release-complete.

## Known limitations and next work

These are the main remaining items, ordered by practical priority:

1. Run the full mandatory PostGIS integration suite against a disposable database and fix any failures. Do not use the live/local application database.
2. Run the entire Playwright matrix (Chromium, Firefox, WebKit, phone, tablet, desktop) against an isolated E2E database. Validate template typing/save, admin boundary drawing/save/reload, city outline search, public polygon edit/delete, filters, and error states.
3. Improve broad mobile administration beyond the currently repaired screens: responsive tables/cards, moderation, users, audit, exports, and all dialog focus behavior.
4. Add dedicated accessibility coverage for polygon drawing controls, keyboard focus, dialog focus restoration, and map alternatives.
5. Replace the in-memory SSE bus if more than one app process/replica will ever be used, or explicitly enforce/document a one-process deployment.
6. Complete the deferred security hardening review: trusted proxy/IP headers, unclaimed upload delivery, placeholder-secret rejection, CSP/security-header browser tests, and production secret rotation.
7. Configure a real production environment before public promotion: production runtime mode, real Turnstile keys, strong secrets, backup/restore schedule, cleanup scheduling, and deployment smoke checks.
8. Build images with actual `GIT_COMMIT` and `BUILD_TIME` values, as shown above, so `/api/version` is useful.

## Important operational cautions

- The current administrator test credential was intentionally left unchanged by owner direction. Do not record it in code or documentation. Rotate it before genuine public production use.
- The local app was observed running with development runtime variables at one point. A real production deployment must set production runtime mode and use real CAPTCHA/secrets.
- The private Nominatim endpoint must remain server-side only; never expose it via `NEXT_PUBLIC_*` or browser code.
- The app has a persistent Docker database and upload volume. Back up both together and test restore on a disposable database.
- Preserve the private-coordinate wall: no exact submitted point, exact address, edit token, CAPTCHA token, secret, or sensitive-export data may enter public responses, HTML, metadata, SSE payloads, ordinary exports, logs, or test artifacts.
