import { access, constants } from 'node:fs/promises';
import postgres from 'postgres';
async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const uploadDir = process.env.UPLOAD_DIR ?? './data/uploads';
  await access(uploadDir, constants.R_OK | constants.W_OK);
  const sql = postgres(databaseUrl, { max: 1, connect_timeout: 5 });
  try {
    const [db] = await sql<{ postgis: string | null; administrators: number }[]>`
      SELECT (SELECT extversion FROM pg_extension WHERE extname = 'postgis') AS postgis,
             (SELECT count(*)::int FROM administrators) AS administrators
    `;
    if (!db?.postgis) throw new Error('PostGIS extension is not installed');
    console.log(
      JSON.stringify({
        ok: true,
        database: true,
        postgis: db.postgis,
        uploadDirectory: true,
        administrators: db.administrators,
      }),
    );
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Doctor failed');
  process.exitCode = 1;
});
