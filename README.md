# Impact System

A reusable, self-hosted, crowdsourced incident-map platform. Administrators launch a map for a
specific incident (storm damage, cellular outage, road conditions, or anything custom); the
public submits location-based reports with exact or privacy-protected locations.

Reports are crowdsourced and may not be independently verified. Impact is not an official
emergency alerting system.

## Stack

- Next.js 14 (App Router) + TypeScript strict
- PostgreSQL 16 + PostGIS 3.4
- MapLibre GL JS with OpenStreetMap-compatible tiles (OpenFreeMap by default)
- Private Nominatim proxy for Canadian address search (never exposed to browsers)
- Cloudflare Turnstile CAPTCHA (fails closed in production)
- Docker Compose deployment

## Quick start (development)

```bash
cp .env.example .env        # fill in secrets: openssl rand -base64 48
docker-compose up -d --build
docker-compose exec app npm run db:migrate
docker-compose exec app npm run db:seed
```

Bootstrap the first administrator (one-time; requires `ADMIN_BOOTSTRAP_EMAIL` and
`ADMIN_BOOTSTRAP_SECRET` in `.env`):

```bash
curl -X POST http://localhost:3000/api/admin/setup \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.ca","password":"a-long-strong-password","secret":"<ADMIN_BOOTSTRAP_SECRET>"}'
```

Then sign in at `/admin` (username or full email).

## Scripts

| Command                   | Purpose                                       |
| ------------------------- | --------------------------------------------- |
| `npm run dev`             | Next.js dev server                            |
| `npm run build` / `start` | Production build / serve                      |
| `npm run lint`            | ESLint                                        |
| `npm run typecheck`       | tsc --noEmit                                  |
| `npm test`                | Vitest unit + PostGIS integration tests       |
| `npm run test:e2e`        | Playwright end-to-end (needs a running stack) |
| `npm run db:migrate`      | Apply SQL migrations                          |
| `npm run db:seed`         | Seed preset templates                         |
| `npm run db:reset`        | Drop and re-apply schema (destructive)        |

Integration tests use `TEST_DATABASE_URL` when set (point it at a disposable PostGIS
instance); otherwise they use `DATABASE_URL`. They are skipped automatically when no
database is reachable.

## Key documentation

- `docs/architecture.md` — system design and code layout
- `docs/privacy-security.md` — privacy model, threat controls, and hard rules
- `docs/runbook.md` — deployment, backup/restore, and operations

## Milestone status

Milestone 1: foundation, admin auth, preset templates, incident creation,
permanent URLs, public map with clustering/filters/counts, report submission with exact and
approximate locations, Nominatim proxy, spam protection, private report editing, basic
moderation, Docker deployment, tests.

Milestone 2: incident editor, PATCH API, polygon drawing editor, visual form builder,
template manager, report expiry with prune script, audit viewer.

Milestone 3: admin management (roles: admin/moderator), moderation pagination + batch ops,
photo uploads with EXIF stripping, CSV/JSON data exports, SSE real-time updates replacing
30s polling, display settings (marker size, cluster radius, description toggle),
archived status, favicon + robots.txt.

Remaining: integrations, advanced analytics, bulk import/export.
