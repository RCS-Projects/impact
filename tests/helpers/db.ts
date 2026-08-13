import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type postgres from 'postgres';

export async function resetAndMigrate(sql: postgres.Sql): Promise<void> {
  await sql.unsafe('DROP SCHEMA public CASCADE');
  await sql.unsafe('CREATE SCHEMA public');
  await sql.unsafe('GRANT ALL ON SCHEMA public TO PUBLIC');
  const dir = path.join(process.cwd(), 'db', 'migrations');
  const files = (await readdir(dir)).filter((file) => file.endsWith('.sql')).sort();
  for (const file of files) {
    const body = await readFile(path.join(dir, file), 'utf8');
    await sql.unsafe(body);
  }
}
