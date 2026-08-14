import postgres from 'postgres';
import { readdir, unlink } from 'fs/promises';
import { join } from 'path';

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

    // Clean orphaned upload files (uploads with no matching report)
    const orphaned = await db<{ filename: string }[]>`
      DELETE FROM uploads
      WHERE report_id IS NULL
        AND created_at < now() - interval '1 hour'
      RETURNING filename
    `;
    if (orphaned.length > 0) {
      const uploadDir = process.env.UPLOAD_DIR ?? join(process.cwd(), 'data', 'uploads');
      for (const { filename } of orphaned) {
        try {
          await unlink(join(uploadDir, filename));
        } catch {
          // file may already be deleted
        }
      }
      console.log(`Cleaned ${orphaned.length} orphaned upload file(s)`);
    }
  } catch (error) {
    console.error('Prune failed:', error);
    process.exit(1);
  } finally {
    await db.end();
  }
}

void main();
