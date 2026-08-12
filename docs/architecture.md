# Architecture

The Next.js application is the only browser-facing service. Cloudflare Tunnel forwards the public hostname to `127.0.0.1:3000`; PostgreSQL/PostGIS is isolated inside Docker Compose.

Browsers call application routes only. The server validates data, proxies Canadian Nominatim searches, verifies CAPTCHA, and makes all database queries. Private report coordinates, submitted addresses, raw IP addresses, and tokens are never serialized through public APIs.
