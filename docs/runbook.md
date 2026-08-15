# Operations Runbook

## Deployment

Production target: `impact.renfrewcountyscanner.com` via Cloudflare Tunnel to
`http://127.0.0.1:3000`. Keep `APP_BIND_ADDRESS=127.0.0.1` in production; publish to a
LAN IP only temporarily with firewall allow-rules.

```bash
# .env must define: APP_URL, POSTGRES_PASSWORD, SESSION_SECRET, IP_HASH_SECRET,
# NOMINATIM_SEARCH_URL, TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY
# Optional map defaults: DEFAULT_MAP_LATITUDE, DEFAULT_MAP_LONGITUDE, DEFAULT_MAP_ZOOM
docker-compose up -d --build
docker-compose exec app npm run db:migrate
docker-compose exec app npm run db:seed          # first deploy only
# bootstrap first admin via /api/admin/setup, then remove ADMIN_BOOTSTRAP_SECRET
```

Production checklist:

- `APP_NODE_ENV=production` and `IMPACT_RUNTIME_MODE=production`
- `DEVELOPMENT_TURNSTILE_BYPASS=false`, real Turnstile keys present
- `ADMIN_BOOTSTRAP_EMAIL` and `ADMIN_BOOTSTRAP_SECRET` removed after first administrator setup
- Strong, unique `POSTGRES_PASSWORD`, `SESSION_SECRET`, `IP_HASH_SECRET`
- `UPLOAD_DIR` pointing to persistent volume (default `./data/uploads`)
- Health endpoints: `/api/health` (liveness), `/api/ready` (DB check)

The temporary development credential is intentionally `admin` / `admin` until the
owner changes it. It must be replaced with a unique password of at least 16
characters before public promotion, and the old credential must be tested as rejected.

Keep `NOMINATIM_SEARCH_URL` server-side; it must not be a `NEXT_PUBLIC_*` variable.

## Updates

```bash
git pull
docker-compose build app
docker-compose up -d app
docker-compose exec app npm run db:migrate
```

Migrations are additive and ordered; the app does not auto-migrate on boot.

## Backup and restore

Both PostgreSQL and the upload volume are stateful and must be backed up together.
Back up with a consistent dump and a filesystem archive:

```bash
docker-compose exec db pg_dump -U impact -Fc impact > impact-$(date +%F).dump
tar --xattrs --acls -czf uploads-$(date +%F).tar.gz data/uploads
```

Automate with cron/systemd on the host and keep off-box copies. Restore:

```bash
docker-compose up -d db
docker exec -i impact_db_1 pg_restore -U impact -d impact --clean --if-exists < impact-YYYY-MM-DD.dump
tar --xattrs --acls -xzf uploads-YYYY-MM-DD.tar.gz -C .
docker-compose restart app
```

Verify after restore: `curl /api/ready`, confirm incident/report counts, and request a
known public photo URL. Perform a restore test before public launch and quarterly
thereafter; never test by overwriting the live database or upload directory.

For a disposable local drill, run `npm run backup:restore:drill`. It creates a
temporary `impact_restore` database, restores the dump, checks core row counts and
PostGIS, then removes the temporary database.

## Cleanup tasks

Expired reports, orphaned upload rows/files, rate-limit events, and geocode cache
entries are pruned by one authoritative, idempotent command:

```bash
# Run via cron or systemd timer (daily recommended)
docker-compose exec -T app npm run cleanup
```

It is safe to rerun after interruption. Capture the totals in the job log and alert
on repeated failures. `scripts/prune-expired.ts` is a compatibility wrapper that
delegates to the same command; schedule `cleanup`, not both scripts.

## Diagnostics

- App logs: `docker-compose logs -f app` (structured JSON events; secrets redacted)
- Audit trail: `SELECT event_type, actor_type, created_at FROM audit_events ORDER BY created_at DESC LIMIT 50;`
- Rate-limit pressure: `SELECT route, count(*) FROM rate_limit_events WHERE created_at > now() - interval '1 hour' GROUP BY route;`
- Flagged queue depth: `SELECT count(*) FROM reports WHERE status = 'flagged';`
- Geocode cache size: `SELECT count(*) FROM geocode_cache;`
- Upload disk usage: `du -sh data/uploads/`

## Incident lifecycle

- **draft** → editable, unresolvable publicly; publish from the admin dashboard.
- **live** → public URL active, reports accepted.
- **closed** → public URL stays viewable; submissions and edits are rejected.
- **archived** → hidden from public landing; admin-only via `/api/admin/incidents`.

## Roles and permissions

- **admin** → full access: create/edit/archive incidents, manage templates, manage users, moderate reports, view audit log.
- **moderator** → can view incidents, moderate reports (approve/reject/flag), view audit log. Cannot edit incidents, manage templates, or manage users.

## Photo uploads

Photo fields store files on disk (default `data/uploads/`). Files are served via
`/api/uploads/files/[filename]` with immutable cache headers. Ensure the upload directory
is backed up and has sufficient disk space. Max file size: 5 MB.

## Real-time updates

The map view subscribes to Server-Sent Events at `/api/incidents/[reference]/events`.
SSE broadcasts `report_created` and `report_updated` events. Falls back to 30-second
polling if the SSE connection fails.

The SSE bus is in-memory and therefore single-process. Run one app replica unless a
shared PostgreSQL LISTEN/NOTIFY bus is deployed. At the reverse proxy, disable
buffering for the events route, use an idle timeout longer than the 30-second
heartbeat, and forward client-IP headers only from trusted proxy hops. Do not cache
or compress the event stream.

## Data exports

Incident reports can be exported via `/api/admin/incidents/[id]/export?format=csv` or
`?format=json`. Ordinary exports contain public coordinates (and public polygon
geometry) only. A separate admin-only `sensitive=true` request includes exact point
coordinates, requires explicit confirmation, sends `no-store`, and records an audit
event. Treat that download as sensitive and transfer it only through an approved
secure channel.

## Content security policy

Middleware issues a per-request nonce for framework inline scripts and styles.
Application components use maintained CSS classes; no React style attributes are
permitted under the production CSP.

## Deployment smoke test

Run the local/server preflight before starting a production deployment:

```bash
npm run preflight
npm run smoke
```

It validates production environment requirements, PostGIS availability, and writable
upload storage without printing secrets.

After every release, verify these endpoints from outside the container:

```bash
curl -fsS https://impact.renfrewcountyscanner.com/api/health
curl -fsS https://impact.renfrewcountyscanner.com/api/ready
curl -fsS https://impact.renfrewcountyscanner.com/
curl -fsS https://impact.renfrewcountyscanner.com/admin/login
curl -fsS https://impact.renfrewcountyscanner.com/map/<known-reference>
```

Check that login pages do not expose bootstrap secrets, public responses do not
contain private coordinates, and a known public photo remains readable after restart.
