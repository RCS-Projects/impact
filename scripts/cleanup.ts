import postgres from 'postgres';

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  const db = postgres(databaseUrl, { max: 1 });
  try {
    const expired = await db<{ id: string }[]>`
      DELETE FROM reports
      WHERE expires_at IS NOT NULL AND expires_at < now()
      RETURNING id
    `;
    console.log(`Pruned ${expired.length} expired report(s)`);

    const oldRates = await db<{ id: number }[]>`
      DELETE FROM rate_limit_events
      WHERE created_at < now() - interval '24 hours'
      RETURNING id
    `;
    console.log(`Cleaned ${oldRates.length} rate limit event(s)`);

    const oldGeo = await db<{ key: string }[]>`
      DELETE FROM geocode_cache
      WHERE expires_at < now()
      RETURNING key
    `;
    console.log(`Cleaned ${oldGeo.length} expired geocode cache entry(ies)`);
  } catch (error) {
    console.error('Cleanup failed:', error);
    process.exit(1);
  } finally {
    await db.end();
  }
}

void main();
