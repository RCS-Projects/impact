import type postgres from 'postgres';

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  retryAfterSeconds: number;
}

export async function checkAndRecord(
  db: postgres.Sql,
  route: string,
  subjectHash: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const rows = await db<{ n: number; inserted: number }[]>`
    WITH recent AS (
      SELECT count(*)::int AS n FROM rate_limit_events
      WHERE route = ${route} AND subject_hash = ${subjectHash}
        AND created_at > now() - make_interval(secs => ${windowSeconds})
    ), inserted AS (
      INSERT INTO rate_limit_events (route, subject_hash)
      SELECT ${route}, ${subjectHash}
      WHERE (SELECT n FROM recent) < ${limit}
      RETURNING id
    )
    SELECT (SELECT n FROM recent) AS n, (SELECT count(*)::int FROM inserted) AS inserted
  `;
  const count = rows[0]?.n ?? 0;
  const allowed = (rows[0]?.inserted ?? 0) > 0;
  if (Math.random() < 0.01) {
    await db`DELETE FROM rate_limit_events WHERE created_at < now() - interval '24 hours'`;
  }
  return { allowed, count, retryAfterSeconds: Math.max(1, Math.ceil(windowSeconds / 60)) * 60 };
}

export function recordEvent(db: postgres.Sql, route: string, subjectHash: string) {
  return db`INSERT INTO rate_limit_events (route, subject_hash) VALUES (${route}, ${subjectHash})`;
}

export function countRecent(
  db: postgres.Sql,
  route: string,
  subjectHash: string,
  windowSeconds: number,
) {
  return db<{ n: number }[]>`
    SELECT count(*)::int AS n FROM rate_limit_events
    WHERE route = ${route} AND subject_hash = ${subjectHash}
      AND created_at > now() - make_interval(secs => ${windowSeconds})
  `.then((rows) => rows[0]?.n ?? 0);
}
