# Architecture

## Overview

Impact is a single Next.js application serving the public map UI, the report forms, the admin
console, and a JSON API, backed by PostgreSQL/PostGIS. Docker Compose runs two services:
`app` and `db`. The database is private; only the app port is published.

```
Browser ──► Next.js (pages + /api) ──► PostgreSQL/PostGIS
                │
                ├──► private Nominatim (server-side proxy only)
                └──► Cloudflare Turnstile siteverify (production)
```

## Code layout

```
src/
  app/                    # Routes only: thin handlers, no SQL
    page.tsx              # Informational landing; incident maps use direct URLs
    map/[reference]/      # Public map + report form pages
    report/edit/[id]/[token]/
    admin/                # Dashboard + moderation queue
    api/                  # JSON endpoints
  server/
    env.ts                # zod-validated environment, fail-closed rules
    errors.ts             # AppError + unified API error wrapper
    log.ts                # Structured JSON logs with secret redaction
    http.ts               # Client IP extraction, cache headers
    db/client.ts          # postgres.js pool
    security/             # hashing, tokens, approximate-point math
    schema/form-schema.ts # Form schema validation + filter derivation
    repos/                # The ONLY place SQL lives
    services/             # Business logic (auth, incidents, reports,
                          # moderation, captcha, geocode, rate limiting)
    templates/            # Seed templates (storm damage, cellular outage)
  components/             # React client components (map, report, admin)
  shared/types.ts         # Types shared by server and client
  lib/                    # Client-safe utilities (geo math, formatting)
  middleware.ts           # Security headers + CSP
db/migrations/            # Ordered SQL migrations
scripts/                  # migrate.ts, seed.ts
tests/                    # Vitest unit + PostGIS integration, Playwright e2e
```

## Layering rules

1. **Route handlers never contain SQL.** They parse input (zod), call a service, and map
   results/errors to HTTP.
2. **Repositories are the only SQL.** Each repo takes the database handle as its first
   argument so services can compose transactions.
3. **Privacy wall is structural.** `reports.repo.ts` queries select only public columns and
   never join `report_private_locations`. Private coordinates are reachable only through
   `reports-private.repo.ts`, used by the edit-link flow and audited admin endpoints.
4. **Errors are typed.** `AppError(status, code, message)` is converted to JSON by
   `handleApi`; unknown errors become generic 500s with redacted logs.

## Public incident URLs

`/map/{slug}-{publicId}` — the slug is derived from the title at creation and frozen at
publish; the `publicId` is an 8-character id from an unambiguous alphabet. Title changes
never break URLs. Drafts are unresolvable publicly; `live` and `closed` resolve.

## Report pipeline

`POST /api/incidents/{reference}/reports`:

1. Rate limit (per hashed IP, DB-backed sliding window)
2. Incident lookup (must be `live`)
3. Turnstile verification (dev bypass only in development mode; fails closed in production)
4. Server-side schema validation of answers (undeclared fields rejected)
5. Geofence check against the incident reporting area (PostGIS `ST_Covers`)
6. Browser-token uniqueness per incident (one active report per browser)
7. Suspicious heuristics: duplicate content hash, rapid submissions from the same IP,
   repeated CAPTCHA failures → status `flagged`, otherwise `unverified`
8. Transaction: insert report (public projection), insert private location, write audit
9. Response: report id + one-time edit URL; persistent browser cookie set

## Geometry model

An incident may accept point reports, polygon reports, or either. An optional
`reporting_area` is an administrator-defined submission boundary; it is not a public
report geometry. Point reports retain the public/private coordinate split. Polygon
reports store and render the submitted public area as GeoJSON/PostGIS geometry and do
not receive a point privacy circle. Reporting-boundary rings are canonical closed
GeoJSON; the map editor keeps an open working ring only while a participant is drawing.

## Moderation model

Statuses: `unverified`, `verified`, `flagged`, `resolved`, `rejected`, `removed`.
The public map renders `unverified` (labelled "Crowdsourced"), `verified`, and `resolved`.
`flagged` is held for review; `rejected`/`removed` are hidden. Every status change and every
view of a true location is written to `audit_events`.

## Rate limiting

DB-backed (`rate_limit_events`) sliding windows keyed by HMAC-hashed subjects, so limits
survive restarts and work across instances. Applied to: admin login, report submission,
report editing, geocode search, and CAPTCHA failure tracking. Old rows are pruned
opportunistically.

## Geocoding

`GET /api/geocode/search` proxies the private Nominatim: Canada-only
(`countrycodes=ca`), minimum 3 characters, 24-hour DB cache (`geocode_cache`), per-IP rate
limiting, 4-second upstream timeout, graceful 503 with map-click fallback messaging. The
Nominatim LAN address exists only in server-side configuration.
