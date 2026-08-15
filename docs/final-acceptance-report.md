# Impact System final acceptance report

Date: 2026-08-15

## Scope and repository state

The completion pass started at `e003c58b208b098544a825116791ea865ce397d1` and
currently ends at `00f960f` (`Remove inline styles and tighten CSP`). The
working tree is clean; changes are committed locally and have not been pushed.

I inspected the application routes, services, repositories, schemas, migrations,
Docker configuration, CI workflow, package scripts, environment example,
README/project documentation, runbook, unit/integration/E2E tests, upload
pipeline, SSE implementation, public map/report flows, and administrator flows.

## Completed and verified locally

### Security, privacy, and operations

- Updated the supported runtime to Node 20 and upgraded Next.js, Sharp,
  Playwright, Vitest, tsx, and related lockfile entries. `npm audit --omit=dev`
  reports zero vulnerabilities.
- Added a production preflight command that checks environment validation,
  PostGIS connectivity, and writable upload storage without printing secrets.
- Upload processing uses Sharp decoding/re-encoding and server-generated media
  paths; client MIME types and filenames are not trusted.
- Public report updates ignore client-supplied place labels and derive locality
  server-side. Full geocode cache entries now expire after five minutes.
- Unified cleanup removes expired reports, old rate-limit/geocode rows, orphaned
  upload rows, and orphaned files.
- Added a persistent Docker upload volume alongside the PostgreSQL volume.
- Preserved the exact/private coordinate wall in public report services,
  geometry responses, exports, and SSE payloads.
- Added/retained App Router loading, not-found, error, and global-error states.

### Geometry and validation

- Strict shared display-settings and reporting-area schemas are used by admin
  routes and incident services.
- Point, polygon, and mixed report geometry validation and persistence remain
  covered by PostGIS integration tests, including public polygon output and
  private-point separation.
- Next.js 15 async route/page parameter and cookie APIs were migrated across the
  App Router and API handlers.

### Public and administrator UX

- The landing page is informational rather than a public incident directory.
- Public report flow includes guided geometry selection, privacy messaging,
  validation/error states, photo controls, filtering, sharing separation, and
  responsive map/report components.
- Administrator editor, moderation, template, user, audit, and polygon-editor
  components were updated for responsive controls, validation, and safer state
  handling.
- Internal navigation now uses Next links where required by Next.js 15.

### Tests and verification

- Unit and PostGIS suites in the Node 20 container: **53 passed** across 9
  files (39 unit tests and 14 integration tests).
- Production image build completed successfully with Next compilation,
  lint/type checking, and static generation.
- Docker Compose app and database are healthy. `/api/health`, readiness, and
  `npm run preflight` succeeded.
- `E2E_BASE_URL=http://192.168.120.7:3000 npm run smoke` passed health,
  readiness, landing page, admin page, security headers, and unknown-incident
  SSE checks.
- Migrated the remaining React style attributes to named CSS classes. The
  production CSP no longer contains `style-src-attr 'unsafe-inline'`; a rebuilt
  Docker image was smoke-tested and served the strict policy.
- Backup/restore drill completed against a disposable database: restored
  `5 incidents | 4 reports | 4 private locations | 0 uploads | 7 audit events`
  and PostGIS was available. PostgreSQL dump and upload-volume archive were
  created without touching production.
- Added `npm run backup:restore:drill`, an idempotent disposable-database drill
  that performs the same verification locally.
- Expanded Playwright configuration to Chromium desktop/phone/tablet,
  Firefox desktop, and WebKit phone projects, and added Axe accessibility smoke
  tests. Execution remains blocked here by unavailable compatible browser
  binaries, so these projects fail loudly rather than being skipped.
- Formatting check and `git diff --check` pass.

## Database and backward compatibility

No destructive migration was added. Existing additive migrations remain the
source of truth, and the integration reset/migrate path completed successfully.
The Docker Compose change adds the upload volume without changing database
schema. Existing point reports remain compatible with the geometry model.

## Browser and viewport results

The Playwright suite now includes the public flow plus Axe accessibility smoke
tests, configured for Chromium desktop/phone/tablet, Firefox desktop, and WebKit
phone. They were attempted in the Node 20 container, but the container lacked
the Playwright headless-shell binary expected by the installed browser revision;
therefore the browser run is recorded as **blocked**, not passed. The configured
matrix and Axe checks require a CI/development image with compatible browser
binaries.

## Privacy evidence

The passing integration assertions verify that approximate reports return a
stable public point while private coordinates remain in
`report_private_locations`, and polygon reports return public geometry. Public
export and SSE code paths use public report projections. No credentials,
private edit tokens, or exact coordinates were added to fixtures or logs.

## SSE and reverse proxy

The SSE client has controlled fallback/polling cleanup and the runbook documents
the current in-memory single-process topology and proxy buffering requirements.
A production reverse-proxy test requires the real proxy configuration and is
therefore not claimed as locally passed.

## Known remaining blockers / production confirmation

- Rotate `admin/admin` before genuine public production use. This credential is
  intentionally unchanged by owner instruction and is not safe for production.
- Production Turnstile keys, secrets, bootstrap removal, backup retention,
  restore scheduling, and proxy configuration require production authority.
- Physical iOS/Android device checks cannot be completed in this container.
- Full Chromium/Firefox/WebKit Playwright and accessibility matrix requires
  browser binaries/CI setup.

## Production deployment checklist

1. Set `IMPACT_RUNTIME_MODE=production` and real Turnstile keys.
2. Set unique `SESSION_SECRET`, `IP_HASH_SECRET`, database credentials, and
   `APP_URL`; remove bootstrap secrets after setup.
3. Rotate `admin/admin` to a unique 16+ character password.
4. Run migrations, `npm run preflight`, health/readiness smoke tests, and the
   authoritative daily `npm run cleanup` job.
5. Back up PostgreSQL and the `uploads_data` volume together; perform a test
   restore before public promotion.
6. Configure trusted proxy IP forwarding and disable SSE buffering/compression.
7. Run the complete browser/accessibility matrix in CI before promotion.
