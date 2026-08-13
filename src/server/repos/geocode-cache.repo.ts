import type postgres from 'postgres';

export function get(db: postgres.Sql, key: string) {
  return db<{ response: unknown }[]>`
    SELECT response FROM geocode_cache WHERE key = ${key} AND expires_at > now() LIMIT 1
  `.then((rows) => rows[0]?.response ?? null);
}

export function set(db: postgres.Sql, key: string, response: unknown, ttlSeconds: number) {
  return db`
    INSERT INTO geocode_cache (key, response, expires_at)
    VALUES (${key}, ${db.json(response as never)}, now() + make_interval(secs => ${ttlSeconds}))
    ON CONFLICT (key) DO UPDATE
    SET response = EXCLUDED.response, expires_at = EXCLUDED.expires_at, created_at = now()
  `;
}
