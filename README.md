# Impact System

Self-hosted crowdsourced incident maps for Canadian communities. Impact System keeps submitted coordinates, edit tokens, network identifiers, and public map data separated by design.

## Local setup

1. Copy `.env.example` to `.env` and replace every secret placeholder.
2. Run `docker-compose up -d db`.
3. Run `npm install`, `npm run db:migrate`, and `npm run db:seed`.
4. Run `npm run dev`.

For production, build and start with `docker-compose up -d --build`. Route the Cloudflare Tunnel hostname to `http://127.0.0.1:3000`; do not expose Postgres.

## Commands

- `npm run format:check`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run db:migrate`

See `docs/` for trust boundaries, the data model, deployment configuration, and known limitations.
