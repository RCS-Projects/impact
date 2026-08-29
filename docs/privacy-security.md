# Privacy and Security

## Location privacy model

Reporters choose between two modes:

- **Exact** — the submitted coordinate is shown publicly.
- **Approximate** — the true coordinate and entered address stay private. A randomized
  public pin is generated **once, server-side**, within 152.4 m (500 feet) of the true
  point, and stored. It never moves on reload. The map renders the pin plus a 500-foot
  privacy circle.

Enforcement is structural, not conventional:

- True coordinates live in `report_private_locations`, a table the public repositories
  never join. Public queries select only public columns — there is no "fetch and strip".
- The public place label is community-level (from geocoding), never a full street address.
- Private edit links return the true coordinate only to holders of the one-time token;
  the token itself is bcrypt-hashed at rest and is never included in public responses.
- Upgrading an approximate report to exact requires an explicit `confirmExact` flag.
- Editing an approximate report without moving it keeps the same randomized pin.

## Identifier handling

- Raw IPs are never stored. Routes HMAC-hash the client IP (`IP_HASH_SECRET`) at the
  boundary; only hashes are persisted (rate limiting, spam signals).
- Browser tokens are SHA-256 hashed before storage.
- Report content is stored with a SHA-256 hash for duplicate detection.
- Logs redact passwords, tokens, CAPTCHA responses, secrets, and cookies by key name.

## Spam and abuse controls (combined, not IP-only)

- Cloudflare Turnstile on submission; production fails closed when keys are missing;
  the development bypass is refused in production runtime mode.
- One active report per browser per incident (unique constraint) with a private edit
  link for updates instead of new pins.
- DB-backed sliding-window rate limits on submission, editing, login, and geocoding.
- Browser-token uniqueness prevents duplicate submissions from the same browser. IP hashes are
  used for rate limiting only; reports are not automatically flagged based on shared networks,
  duplicate content, CAPTCHA history, or edit distance.

## Authentication and admin protection

- Administrators authenticate with bcrypt-hashed passwords (cost 12); login is
  rate-limited per IP+login with a timing-equalized dummy comparison.
- Sessions are 12-hour HS256 JWTs in HttpOnly, SameSite=Lax cookies (Secure in
  production).
- All authenticated mutations require a double-submit CSRF token matched against the
  session JWT claim.
- One-time bootstrap endpoint seeds the first administrator only when the table is empty
  and the environment secret matches; remove `ADMIN_BOOTSTRAP_SECRET` afterwards.
- True-coordinate viewing is admin-role only and writes an audit event per view.

## Input and output safety

- All API input is validated with zod; form answers are validated against the incident's
  schema snapshot and undeclared fields are rejected.
- React escapes rendered content; free-text fields are length-capped and control
  characters stripped server-side.
- Geofence, schema, CAPTCHA, and role checks are server-side only — client checks are UX.

## Transport and headers

- Middleware sets CSP, `X-Content-Type-Options`, `X-Frame-Options: DENY`,
  `Referrer-Policy`, and a restrictive `Permissions-Policy`.
- Public report queries are cacheable for 15 seconds; all authenticated and mutating
  responses are `no-store`.

## Hard rules

1. Never return true coordinates, raw IPs, edit tokens, CAPTCHA tokens, or admin data in
   public responses.
2. Never expose PostgreSQL or the private Nominatim to the public internet.
3. No development bypass of any kind in production runtime mode.
4. Permanent URLs survive title changes; slugs freeze at publish.
5. Every moderation action, login, publish/close, and true-location view is audited.
