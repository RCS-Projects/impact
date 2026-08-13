# Operations Runbook

## Deployment

Production target: `impact.renfrewcountyscanner.com` via Cloudflare Tunnel to
`http://127.0.0.1:3000`. Keep `APP_BIND_ADDRESS=127.0.0.1` in production; publish to a
LAN IP only temporarily with firewall allow-rules.

```bash
# .env must define: APP_URL, POSTGRES_PASSWORD, SESSION_SECRET, IP_HASH_SECRET,
# NOMINATIM_SEARCH_URL, TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY
docker-compose up -d --build
docker-compose exec app npm run db:migrate
docker-compose exec app npm run db:seed          # first deploy only
# bootstrap first admin via /api/admin/setup, then remove ADMIN_BOOTSTRAP_SECRET
```

Production checklist:

- `APP_NODE_ENV=production` (forces production runtime mode)
- `DEVELOPMENT_TURNSTILE_BYPASS=false`, real Turnstile keys present
- `ADMIN_BOOTSTRAP_SECRET` removed after first administrator setup
- Strong, unique `POSTGRES_PASSWORD`, `SESSION_SECRET`, `IP_HASH_SECRET`
- Health endpoints: `/api/health` (liveness), `/api/ready` (DB check)

## Updates

```bash
git pull
docker-compose build app
docker-compose up -d app
docker-compose exec app npm run db:migrate
```

Migrations are additive and ordered; the app does not auto-migrate on boot.

## Backup and restore

The only stateful service is PostgreSQL. Back up with a consistent dump:

```bash
docker-compose exec db pg_dump -U impact -Fc impact > impact-$(date +%F).dump
```

Automate with cron/systemd on the host and keep off-box copies. Restore:

```bash
docker-compose up -d db
docker exec -i impact_db_1 pg_restore -U impact -d impact --clean --if-exists < impact-YYYY-MM-DD.dump
docker-compose restart app
```

Verify after restore: `curl /api/ready` and confirm incident/report counts.

## Diagnostics

- App logs: `docker-compose logs -f app` (structured JSON events; secrets redacted)
- Audit trail: `SELECT event_type, actor_type, created_at FROM audit_events ORDER BY created_at DESC LIMIT 50;`
- Rate-limit pressure: `SELECT route, count(*) FROM rate_limit_events WHERE created_at > now() - interval '1 hour' GROUP BY route;`
- Flagged queue depth: `SELECT count(*) FROM reports WHERE status = 'flagged';`

## Incident lifecycle

- **draft** → editable, unresolvable publicly; publish from the admin dashboard.
- **live** → public URL active, reports accepted.
- **closed** → public URL stays viewable; submissions and edits are rejected.
- **archived** → planned (M2) with the archive UI.

## Known limitations (milestone 1)

- Reporting areas are pasted GeoJSON; a visual drawing editor is planned (M2).
- No photo uploads yet (M3), no exports, polling-based freshness (30 s).
- Single-admin bootstrap flow; multi-admin management UI is planned.
