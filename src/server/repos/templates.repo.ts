import type postgres from 'postgres';

export interface TemplateRow {
  id: string;
  key: string;
  title: string;
  description: string | null;
  schema: unknown;
}

export function findByKey(db: postgres.Sql, key: string) {
  return db<TemplateRow[]>`
    SELECT id, key, title, description, schema FROM schema_templates WHERE key = ${key} LIMIT 1
  `.then((rows) => rows[0] ?? null);
}

export function list(db: postgres.Sql) {
  return db<TemplateRow[]>`
    SELECT id, key, title, description, schema FROM schema_templates ORDER BY title LIMIT 50
  `;
}

export function upsert(
  db: postgres.Sql,
  template: { key: string; title: string; description: string | null; schema: unknown },
) {
  return db`
    INSERT INTO schema_templates (key, title, description, schema)
    VALUES (${template.key}, ${template.title}, ${template.description}, ${db.json(template.schema as never)})
    ON CONFLICT (key) DO UPDATE
    SET title = EXCLUDED.title, description = EXCLUDED.description,
      schema = EXCLUDED.schema, updated_at = now()
  `;
}
