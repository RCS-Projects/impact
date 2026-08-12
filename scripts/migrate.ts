import fs from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';

const connection = process.env.DATABASE_URL;
if (!connection) throw new Error('DATABASE_URL is required');

const sql = postgres(connection, { max: 1 });

async function main() {
  await sql`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
  const applied = new Set(
    (await sql<{ name: string }[]>`SELECT name FROM schema_migrations`).map((r) => r.name),
  );
  const directory = path.join(process.cwd(), 'db', 'migrations');
  const migrations = (await fs.readdir(directory)).filter((file) => file.endsWith('.sql')).sort();
  for (const migration of migrations) {
    if (applied.has(migration)) continue;
    const source = await fs.readFile(path.join(directory, migration), 'utf8');
    await sql.begin(async (tx) => {
      await tx.unsafe(source);
      await tx`INSERT INTO schema_migrations (name) VALUES (${migration})`;
    });
    console.info(JSON.stringify({ event: 'migration_applied', migration }));
  }
  await sql.end();
}

main().catch(async (error) => {
  console.error(
    JSON.stringify({
      event: 'migration_failed',
      message: error instanceof Error ? error.message : 'unknown error',
    }),
  );
  await sql.end();
  process.exit(1);
});
