# Impact System — Development Handoff Plan

## Purpose

Impact System is a self-hosted, Canadian crowdsourced incident-map platform. An administrator publishes a permanent incident map; the public submits location-based reports with exact or 500-foot privacy-protected locations.

The current target is a complete, testable development system on the LAN. Public Cloudflare deployment is explicitly deferred until the security checklist is complete.

## Current Environment

- Repository: `github.com/renfrewcountyscanner/impact`
- Development preview: `http://192.168.120.7:3000`
- Development admin: `admin` / `admin` — LAN-only and must be replaced before public deployment.
- Runtime: Docker Compose; Next.js/TypeScript app and private PostgreSQL/PostGIS database.
- Public-domain target: `impact.renfrewcountyscanner.com`, to be routed via Cloudflare Tunnel later.
- Configuration: `.env` is local-only and ignored by Git. `.env.example` documents all required settings.

## Implemented So Far

### Foundation

- Next.js 14 + TypeScript, strict type checking, ESLint, Prettier, Vitest, Dockerfile, Docker Compose.
- PostGIS SQL migration with explicit tables, enums, spatial indexes, audit events, rate-limit events, and separate private-coordinate table.
- Health: `/api/health`; readiness: `/api/ready`.
- Seeded Storm Damage and Cellular Outage form templates.
- Git commits are pushed directly to `main` as milestones complete.

### Security and Privacy

- Public incident URLs use canonical slug plus non-sequential public ID: `/map/{slug}-{publicId}`.
- Form answers are validated server-side against the incident schema; undeclared fields are rejected.
- Submitted coordinates are separate from public coordinates in `report_private_locations`.
- Approximate reports store one stable, area-uniform randomized public coordinate within 152.4 m of the true point.
- Browser, edit, and IP identifiers are hashed; IPs are HMAC-hashed with a dedicated secret.
- Private edit tokens are bcrypt-hashed; raw edit token is returned only at report creation.
- Public report query selects only public coordinates and never selects private location rows.
- Optional incident reporting boundary is a PostGIS geography; submissions and edits are server-side rejected outside it.
- Production Turnstile configuration fails closed. The current LAN-only dev environment has an explicit development CAPTCHA bypass.

### Admin and Public Workflow

- Local admin login with signed, HttpOnly session cookie.
- One-time environment bootstrap API exists; current LAN tester account is seeded separately as `admin` / `admin`.
- Admin API can create a draft from either seeded template, set centre/zoom, optional GeoJSON reporting area, and publish it.
- Admin page has a basic create/publish UI. Reporting areas currently require pasted GeoJSON; a visual drawing editor is still required.
- Public map page has incident information, disclaimer, boundary outline, MapLibre map, marker display, privacy circles, and accessible visible-report list.
- Public report page supports backend-proxied Canadian address autocomplete, map click, draggable pin, browser geolocation, exact/approximate choice, dynamic schema fields, and edit URL response.
- Private edit APIs work; browser edit UI still needs implementation.

### Verified Live on LAN

1. Admin login.
2. Create Storm Damage draft.
3. Publish permanent incident URL.
4. Submit approximate report with development CAPTCHA bypass.
5. Query report in public map bounding box without private coordinates.
6. Retrieve private report through edit URL.
7. Update same report through edit URL without creating a second pin.

## Important Current Limitations

- UI is functional but visually basic and needs mobile/accessibility polish.
- No visual admin reporting-area drawing/editing tool yet.
- No incident list/dashboard, edit incident page, template manager, or custom form-builder UI.
- No browser UI for private report editing, moderation queue, audit viewer, report lifecycle controls, or admin true-coordinate viewer.
- Public-map filtering, category counts, clustering, and report expiry are incomplete.
- CAPTCHA widget integration is not implemented in the browser; development bypass is active only in the LAN config.
- No CSRF implementation for authenticated state-changing requests yet.
- No photo uploads, OIDC/SSO, exports, backup automation, monitoring, server-side clustering, or production Cloudflare Tunnel configuration.
- Automated coverage is currently limited to form validation and approximate-point distance. Expand tests substantially before public launch.

## Next Implementation Sequence

### 1. Complete Public Reporting UX

- Add visible selected-coordinate feedback and client-side reporting-boundary feedback to the map picker (server remains authoritative).
- Add browser Turnstile widget and submit token; leave development bypass gated by `IMPACT_RUNTIME_MODE=development` only.
- Add private edit page at `/report/edit/{reportId}/{token}` with schema-driven fields, location picker, and explicit exact-location confirmation.
- Add clear loading, error, closed-incident, and Nominatim-unavailable states.
- Add filter controls generated from schema select/radio/multi-select fields, key-category counts, and report detail panel.

### 2. Complete Administration

- Add incident dashboard: list drafts/live/closed/archived maps and show permanent URLs.
- Add visual MapLibre reporting-area editor (draw polygon, edit vertices, clear, preview). Store GeoJSON through existing API field.
- Add form builder for supported types: short/long text, select, multi-select, radio, checkbox, boolean, datetime, informational text. Enforce stable key and schema validation.
- Add incident edit/close/archive operations with server authorization and audit events.
- Add moderation list and actions: approve, hide, reject, resolve, restore. Display automatic suspicious reasons.
- Add audited admin-only true-coordinate view. Never include it in standard/public response objects.

### 3. Abuse Controls and Moderation

- Implement per-route database rate limits using `rate_limit_events`.
- Enforce configured per-incident hashed-IP report limit over a time window.
- Implement suspicious checks: rapid submission, duplicate content, implausible move, CAPTCHA failure, excessive network activity.
- Send suspicious reports to `flagged`; public map should only render configured visible moderation states.
- Add configurable report expiry and scheduled cleanup/hide behavior.

### 4. Tests

- Add integration tests against PostGIS for permanent URL resolution, geofence accept/reject, one-report-per-browser enforcement, edit authorization, IP hashing, and public query field separation.
- Add Nominatim proxy tests for Canadian restriction, min query, cache, timeout, malformed output, and unavailable upstream.
- Add authorization/moderation tests.
- Add Playwright end-to-end test: admin creates/publishes map → public submits approximate report → public map renders it → edit URL updates it.
- Add E2E test for out-of-area rejection.

### 5. Production Readiness

- Replace development credentials and remove `ADMIN_BOOTSTRAP_SECRET` after first administrator setup.
- Set `APP_NODE_ENV=production`, `IMPACT_RUNTIME_MODE=production`, `DEVELOPMENT_TURNSTILE_BYPASS=false`, and real Turnstile keys.
- Configure Cloudflare Tunnel to forward `impact.renfrewcountyscanner.com` to `http://127.0.0.1:3000` (production binding must return to loopback).
- Add CSRF protection for authenticated mutation routes, restrictive CSP/security headers, structured redacted logs, and cache-control review.
- Establish database backup/restore procedure and container update/runbook.
- Run full test/build/migration/Docker smoke suite before making the tunnel public.

## Key Files

- `docker-compose.yml` — app/database deployment and safe network bindings.
- `db/migrations/001_initial.sql` — complete initial schema and indexes.
- `src/lib/form-schema.ts` — authoritative form-schema and answer validation.
- `src/lib/security.ts` — hashing, edit tokens, and approximate point generation.
- `src/app/api/incidents/[reference]/reports/route.ts` — public report creation and public bounding-box query.
- `src/app/api/reports/[id]/edit/[token]/route.ts` — private report read/update.
- `src/components/` — MapLibre public map, report form, location picker, admin dashboard.
- `docs/architecture.md`, `docs/data-model.md`, `docs/privacy-security.md` — initial trust-boundary documentation.

## Non-Negotiable Rules

- Do not return raw submitted addresses, true coordinates, raw IPs, CAPTCHA tokens, edit tokens, secrets, or admin data in public responses.
- Do not fetch full private report rows for public APIs and strip afterward; public queries must select only public columns.
- Do not trust client-side schema, location, boundary, CAPTCHA, or role checks.
- Preserve permanent published URLs even when title changes.
- Approximate points must be generated once server-side, remain stable, be no more than 152.4 m from the true coordinate, and show a circle containing the true coordinate.
- Production must fail closed when Turnstile configuration is missing; no development bypass in production.
- Do not expose PostgreSQL or private Nominatim to the public internet.
