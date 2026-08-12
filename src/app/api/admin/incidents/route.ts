import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { getSql } from '@/lib/db';
import { incidentFormSchema } from '@/lib/form-schema';

const input = z.object({
  title: z.string().min(3).max(160),
  description: z.string().max(4000).optional(),
  templateKey: z.string().min(1).optional(),
  center: z.object({
    latitude: z.number().min(41).max(84),
    longitude: z.number().min(-142).max(-52),
    zoom: z.number().min(4).max(18),
  }),
  reportingArea: z.record(z.unknown()).optional(),
});
const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 70) || 'incident';

export async function POST(request: NextRequest) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid incident' }, { status: 400 });
  const sql = getSql();
  let formSchema: unknown = { version: 1, fields: [] };
  if (parsed.data.templateKey) {
    const templates = await sql<
      { schema: unknown }[]
    >`SELECT schema FROM schema_templates WHERE key = ${parsed.data.templateKey} LIMIT 1`;
    if (!templates[0]) return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    formSchema = templates[0].schema;
  }
  try {
    incidentFormSchema.parse(formSchema);
  } catch {
    return NextResponse.json({ error: 'Invalid form schema' }, { status: 400 });
  }
  const point = `SRID=4326;POINT(${parsed.data.center.longitude} ${parsed.data.center.latitude})`;
  const area = parsed.data.reportingArea ? JSON.stringify(parsed.data.reportingArea) : null;
  try {
    const rows = await sql<{ id: string; canonical_slug: string; public_id: string }[]>`
      INSERT INTO incidents (public_id, canonical_slug, title, description, initial_center, initial_zoom, reporting_area, form_schema)
      VALUES (${nanoid(10)}, ${slugify(parsed.data.title)}, ${parsed.data.title}, ${parsed.data.description ?? null}, ST_GeogFromText(${point}), ${parsed.data.center.zoom}, CASE WHEN ${area}::text IS NULL THEN NULL ELSE ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(${area}), 4326))::geography END, ${sql.json(formSchema as never)})
      RETURNING id, canonical_slug, public_id
    `;
    await sql`INSERT INTO audit_events (incident_id, actor_type, actor_id, event_type) VALUES (${rows[0].id}, 'admin', ${admin.id}, 'incident_created')`;
    return NextResponse.json(
      { id: rows[0].id, url: `/map/${rows[0].canonical_slug}-${rows[0].public_id}` },
      { status: 201 },
    );
  } catch {
    return NextResponse.json(
      { error: 'Reporting area must be valid GeoJSON polygon data' },
      { status: 400 },
    );
  }
}
