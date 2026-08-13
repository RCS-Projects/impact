import postgres from 'postgres';

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  const db = postgres(databaseUrl, { max: 1 });
  try {
    const result = await db<{ id: string }[]>`
      DELETE FROM reports
      WHERE expires_at IS NOT NULL AND expires_at < now()
      RETURNING id
    `;
    console.log(`Pruned ${result.length} expired report(s)`);
  } catch (error) {
    console.error('Prune failed:', error);
    process.exit(1);
  } finally {
    await db.end();
  }
}

void main();
