# Impact System — Project Status

> Last updated: 2026-08-14
> Repository: github.com/renfrewcountyscanner/impact
> Tech: Next.js 14 App Router, TypeScript strict, PostgreSQL/PostGIS 16, MapLibre GL, Docker

> Status note (2026-08-15): The original roadmap below predates the stabilization
> work. Items marked as later are not authoritative; the current implementation
> includes secure Sharp image processing, strict geometry/display validation, point
> and polygon reports, schema locking, audited sensitive exports, SSE cleanup, guided
> reporting, responsive moderation, configurable map defaults, and nonce-based CSP.
> Administrator credentials remain intentionally unchanged at the owner's request.

---

## What's Done

### M1 — Foundation (complete)
- Full v2 rewrite with layered architecture (routes → services → repositories)
- Dark ops-room UI (charcoal #0d1215, amber #f5a524)
- Database schema v2 with PostGIS geography, audit_events, rate_limit_events, geocode_cache
- Admin authentication (jose JWT, bcryptjs passwords, CSRF double-submit)
- DB-backed rate limiting with HMAC-hashed IPs (never stored raw)
- Preset incident templates (storm-damage, cellular-outage)
- Incident CRUD with lifecycle: draft → live → closed → archived
- Permanent URLs for incidents (/map/{slug}-{publicId})
- Public map with MapLibre GL clustering, filters, report counts, polling
- Report submission with exact/approximate privacy (152.4m fuzzing radius)
- Nominatim reverse geocoding proxy (private server at 192.168.90.115)
- Turnstile CAPTCHA with dev bypass
- Private report editing via tokenized URLs
- Basic moderation (approve/flag/resolve/reject/remove)
- Docker Compose deployment (PostgreSQL 16 + Next.js app)
- 29/29 unit tests passing (geo, privacy, security, form-schema)
- 13 integration tests (skipped in CI, require real DB)

### M2 — Incident Management (complete)
- Visual incident editor with all fields (title, description, coordinates, zoom, form schema, display settings)
- PATCH API for incident updates
- Hand-rolled polygon drawing editor (MapLibre draw, no plugin dependency)
- Visual form builder with 10 field types (short_text, long_text, single_select, multi_select, radio, checkbox, boolean, datetime, info, photo)
- Template manager (create, edit, delete schema templates)
- Report expiry with configurable per-incident days
- Prune script (scripts/prune-expired.ts) — hard-deletes expired reports + orphaned uploads
- Combined cleanup script (scripts/cleanup.ts) — expired reports + rate limits + geocode cache
- Audit viewer page with paginated global event log

### M3 — Admin & Moderation (complete)
- Admin user management (create, update role, delete users)
- Two roles: admin (full access) and moderator (moderate reports only)
- Moderation pagination with limit/offset/count
- Batch moderation (batch status changes on multiple reports)
- Moderation action notes (stored in audit metadata)
- archivedAt surfaced in admin incident rows
- Audit viewer with corrected event labels for all event types

### M4 — Public Features (complete)
- Photo upload system (upload API, image serving, photo field type)
- EXIF/metadata stripping on upload (pure JS JPEG/WebP stripper)
- Public anonymous photo uploads with rate limiting (10/hour/IP)
- CSV/JSON data export (admin-only, per-incident)
- SSE real-time updates replacing 30s polling (with fallback)
- Reverse geocoding on location picker (click map → get address)
- Report deletion by owners (with rate limiting)
- Display settings wired to map (marker radius, cluster radius/max zoom, description toggle)
- Display settings admin UI (proper form instead of raw JSON)
- Favicon (SVG) + robots.txt
- ARCHIVED status with dedicated chip color

### Infrastructure (complete)
- Environment schema validation (Zod, includes UPLOAD_DIR)
- HSTS header in production
- CSP headers (with unsafe-inline for Next.js compatibility)
- Health endpoints (/api/health, /api/ready)
- LAN dev stack at 192.168.120.7:3000
- SSH key-based git access

---

## What Should Be Done Later

### High Priority

**1. Remove incident listing from public landing page**
The landing page (/) currently lists all live and closed incidents publicly. It should be a static informational page only — no incident directory. Maps are accessed via direct links only.
- File: `src/app/page.tsx`
- Remove `listPublicAll()` call, remove incident card rendering, keep descriptive content
- Cleanup: Delete unused `listPublicAll()` and `listPublicLive()` from service/repo layers

**2. Default datetime fields to "now"**
The "When did you observe this?" datetime field renders blank. It should default to the current date/time.
- File: `src/components/report/field-input.tsx` line 177
- When `defaultValue` is undefined (create mode), use `new Date().toISOString().slice(0, 16)`

**3. Add Facebook share button**
After report submission, give users a "Share on Facebook" option.
- File: `src/components/report/report-form.tsx` (success state)
- Add a Facebook share link using `https://www.facebook.com/sharer/sharer.php?u={url}`
- Also: Add Open Graph meta tags to map pages for proper link previews

**4. Share exact locations with external parties (e.g., police)**
Currently only admin-role users can view exact (un-fuzzed) locations via the true-location endpoint. Need a way to share data with external parties without giving them full admin access.
- Options:
  - A. Add a "viewer" role with read-only access to specific incidents including exact locations
  - B. Add a token-based sharing link (time-limited, per-incident)
  - C. Add exact locations to CSV/JSON exports (admin-only, for manual sharing)
- Recommended: Option C (simplest, leverages existing export system)

**5. Fix SSE fallback memory leak**
The EventSource onerror fallback creates a `setInterval` that's never cleared.
- File: `src/components/map/incident-map-view.tsx` lines 267-270
- Store interval in a ref, clear on unmount

**6. Add React error boundary**
No error boundary in layout.tsx — component crashes show Next.js default error page.
- File: `src/app/layout.tsx`
- Wrap `{children}` in an error boundary component

### Medium Priority

**7. Fix button-sm touch targets** — `.button-sm` lacks `min-height: 44px`

**8. Add loading states / spinners** — Multiple components show no loading indicator

**9. Admin confirmation dialogs** — Publish/close/archive actions have no confirmation

**10. SSE endpoint rate limiting** — No limit on concurrent connections per IP

**11. Privacy radio group accessibility** — Handles Enter but not Space key

**12. Fix `--text-muted` CSS variable** — `.chip-archived` uses undefined variable

**13. Validate displaySettings schema** — Accepted as `z.unknown()`, malformed JSON could crash map

**14. Lock field keys after first publish** — Changing keys orphans existing report answers

### Low Priority

**15.** Replace `window.location.reload()` with Next.js router in admin login/logout
**16.** Add Open Graph meta tags to map pages for social sharing
**17.** Extract inline styles to CSS classes (~70+ instances across admin components)
**18.** Fix form builder global mutable counter (`nextId` persists across hot reloads)
**19.** Add sitemap.xml (referenced in robots.txt but doesn't exist)
**20.** CSP unsafe-inline mitigation (migrate to nonces for inline scripts)
**21.** Image CLS prevention (add explicit width/height to report photos)
**22.** Configurable default coordinates (admin create form hardcodes Ottawa)

---

## Architecture Reference

```
src/
  app/                    # Next.js App Router pages
    api/                  # API routes
      admin/              # Admin-only endpoints (CSRF protected)
      incidents/          # Public incident + report endpoints
      uploads/            # Photo upload + file serving
    map/[reference]/      # Public map + report pages
    admin/                # Admin UI pages
  components/
    admin/                # Admin UI (incident editor, moderation, templates, users, audit)
    map/                  # MapLibre map view
    report/               # Report form, location picker, field inputs
  server/
    repos/                # Database queries (PostgreSQL tagged templates)
    services/             # Business logic
    schema/               # Zod validation schemas
    security/             # Hashing, tokens, privacy
    lib/                  # Utilities (image metadata stripper)
  shared/                 # Types shared between client and server
  lib/                    # Client-side utilities (CSRF, format, geo)
scripts/                  # Cleanup and prune scripts
db/migrations/            # SQL migration files
docs/                     # Architecture, security, runbook
```

### Key Patterns
- **Thin routes → services → repositories** — no business logic in routes
- **AppError + handleApi wrapper** — consistent error handling with HTTP status mapping
- **CSRF double-submit** — cookie + header token on all admin mutations
- **DB-backed rate limiting** — per-route, per-IP hash, with probabilistic cleanup
- **Privacy wall** — exact locations in `report_private_locations`, public coords in `reports`
- **Audit trail** — every state change logged to `audit_events` with actor + metadata
