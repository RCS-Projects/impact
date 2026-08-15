import postgres from 'postgres';
import { unlink } from 'node:fs/promises';
import path from 'node:path';

export async function runCleanup() {
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

    const orphaned = await db<{ filename: string }[]>`
      DELETE FROM uploads
      WHERE report_id IS NULL
        AND created_at < now() - interval '1 hour'
      RETURNING filename
    `;
    const uploadDir = process.env.UPLOAD_DIR ?? path.join(process.cwd(), 'data', 'uploads');
    let removedFiles = 0;
    for (const { filename } of orphaned) {
      if (filename !== path.basename(filename)) continue;
      try {
        await unlink(path.join(uploadDir, filename));
        removedFiles += 1;
      } catch {
        // The database row is still removed if the file was already absent.
      }
    }
    console.log(`Cleaned ${orphaned.length} orphaned upload row(s), removed ${removedFiles} file(s)`);
  } catch (error) {
    console.error('Cleanup failed:', error);
    process.exit(1);
  } finally {
    await db.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) void runCleanup();
