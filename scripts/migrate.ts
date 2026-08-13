import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';

const connection = process.env.DATABASE_URL;
if (!connection) throw new Error('DATABASE_URL is required');
const sql = postgres(connection, { max: 1 });

async function main() {
  const reset = process.argv.includes('--reset');
  if (reset) {
    console.warn('Resetting database schema');
    await sql.unsafe('DROP SCHEMA public CASCADE');
    await sql.unsafe('CREATE SCHEMA public');
    await sql.unsafe('GRANT ALL ON SCHEMA public TO PUBLIC');
  }
  await sql`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`;
  const dir = path.join(process.cwd(), 'db', 'migrations');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const applied = await sql`SELECT name FROM schema_migrations WHERE name = ${file}`;
    if (applied.length > 0) continue;
    const body = await readFile(path.join(dir, file), 'utf8');
    console.info(JSON.stringify({ event: 'migration_applying', file }));
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`INSERT INTO schema_migrations (name) VALUES (${file})`;
    });
    console.info(JSON.stringify({ event: 'migration_applied', file }));
  }
  await sql.end();
}

main().catch(async (error) => {
  console.error(error);
  await sql.end();
  process.exit(1);
});
