import { getSql } from './db';

export type PublicIncident = {
  id: string;
  publicId: string;
  slug: string;
  title: string;
  description: string | null;
  status: string;
  publishedAt: string | null;
  updatedAt: string;
  initialLongitude: number;
  initialLatitude: number;
  initialZoom: number;
  reportingArea: unknown | null;
  formSchema: unknown;
  displaySettings: unknown;
};

export function parsePublicReference(reference: string) {
  const match = /^(.*)-([A-Za-z0-9_-]{10})$/.exec(reference);
  return match ? { slug: match[1], publicId: match[2] } : null;
}

export async function findPublicIncident(reference: string): Promise<PublicIncident | null> {
  const parsed = parsePublicReference(reference);
  if (!parsed) return null;
  const rows = await getSql()<PublicIncident[]>`
    SELECT id, public_id AS "publicId", canonical_slug AS slug, title, description, status,
      published_at::text AS "publishedAt", updated_at::text AS "updatedAt",
      ST_X(initial_center::geometry) AS "initialLongitude", ST_Y(initial_center::geometry) AS "initialLatitude",
      initial_zoom::float AS "initialZoom", ST_AsGeoJSON(reporting_area::geometry)::jsonb AS "reportingArea",
      form_schema AS "formSchema", display_settings AS "displaySettings"
    FROM incidents WHERE canonical_slug = ${parsed.slug} AND public_id = ${parsed.publicId} AND status IN ('live', 'closed') LIMIT 1
  `;
  return rows[0] ?? null;
}
