import postgres from 'postgres';
import { cellularOutageTemplate, stormDamageTemplate } from '../src/lib/templates';

const connection = process.env.DATABASE_URL;
if (!connection) throw new Error('DATABASE_URL is required');
const sql = postgres(connection, { max: 1 });

async function main() {
  for (const template of [stormDamageTemplate, cellularOutageTemplate]) {
    await sql`
      INSERT INTO schema_templates (key, title, description, schema)
      VALUES (${template.key}, ${template.title}, ${template.description}, ${sql.json(template.schema)})
      ON CONFLICT (key) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description, schema = EXCLUDED.schema, updated_at = now()
    `;
  }
  console.info(JSON.stringify({ event: 'templates_seeded' }));
  await sql.end();
}

main().catch(async (error) => {
  console.error(error);
  await sql.end();
  process.exit(1);
});
