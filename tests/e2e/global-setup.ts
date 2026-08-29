import postgres from 'postgres';
import { loadDotEnv } from '../helpers/env';

loadDotEnv();

async function globalSetup() {
  const databaseUrl = process.env.E2E_DATABASE_URL;
  if (!databaseUrl) {
    if (process.env.E2E_REQUIRE_ISOLATION === 'true')
      throw new Error('E2E_DATABASE_URL is required when E2E_REQUIRE_ISOLATION=true');
    console.warn('E2E_DATABASE_URL is not set; skipping E2E fixture cleanup');
    return;
  }
  const sql = postgres(databaseUrl, { max: 1, connect_timeout: 3 });
  try {
    await sql`TRUNCATE rate_limit_events`;
    // Remove stale E2E incidents so the admin dashboard stays fast and deterministic.
    // Reports cascade; audit events are retained with NULL incident/report references.
    const deleted = await sql`
      DELETE FROM incidents
      WHERE title LIKE ${'E2E Storm %'}
         OR title LIKE ${'E2E Polygon %'}
         OR canonical_slug LIKE ${'e2e-%'}
      RETURNING id
    `;
    if (deleted.length > 0) {
      console.info(JSON.stringify({ event: 'e2e_cleanup', removed_incidents: deleted.length }));
    }
    const removedTemplates = await sql`
      DELETE FROM schema_templates WHERE key LIKE ${'e2e-field-%'} RETURNING key
    `;
    if (removedTemplates.length > 0) {
      console.info(
        JSON.stringify({ event: 'e2e_cleanup_templates', removed: removedTemplates.length }),
      );
    }
  } catch (error) {
    console.warn('Could not reset E2E state:', error);
  } finally {
    await sql.end();
  }
}

export default globalSetup;
