import { access, constants } from 'node:fs/promises';
import postgres from 'postgres';
import { getEnv, isProduction } from '../src/server/env';

async function main() {
  const env = getEnv();
  const uploadDir = env.UPLOAD_DIR ?? './data/uploads';
  await access(uploadDir, constants.R_OK | constants.W_OK);
  const sql = postgres(env.DATABASE_URL, { max: 1, connect_timeout: 5 });
  try {
    const rows = await sql<{ postgis: string | null }[]>`
      SELECT extversion AS postgis FROM pg_extension WHERE extname = 'postgis'
    `;
    if (!rows[0]?.postgis) throw new Error('PostGIS extension is not installed');
  } finally {
    await sql.end();
  }
  console.log(
    JSON.stringify({
      ok: true,
      runtime: isProduction() ? 'production' : (env.IMPACT_RUNTIME_MODE ?? env.NODE_ENV),
      postgis: true,
      uploadDirectoryWritable: true,
    }),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Preflight failed');
  process.exit(1);
});
