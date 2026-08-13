import postgres from 'postgres';
import { seedTemplates } from '../src/server/templates/seed-templates';

const connection = process.env.DATABASE_URL;
if (!connection) throw new Error('DATABASE_URL is required');
const sql = postgres(connection, { max: 1 });

async function main() {
  for (const template of seedTemplates) {
    await sql`
      INSERT INTO schema_templates (key, title, description, schema)
      VALUES (${template.key}, ${template.title}, ${template.description}, ${sql.json(template.schema as never)})
      ON CONFLICT (key) DO UPDATE
      SET title = EXCLUDED.title, description = EXCLUDED.description,
        schema = EXCLUDED.schema, updated_at = now()
    `;
    console.info(JSON.stringify({ event: 'template_seeded', key: template.key }));
  }
  await sql.end();
}

main().catch(async (error) => {
  console.error(error);
  await sql.end();
  process.exit(1);
});
