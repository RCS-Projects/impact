import type postgres from 'postgres';

export interface IncidentPublicRow {
  id: string;
  publicId: string;
  slug: string;
  title: string;
  description: string | null;
  status: string;
  publishedAt: string | null;
  updatedAt: string;
  longitude: number;
  latitude: number;
  zoom: number;
  reportingArea: unknown | null;
  formSchema: unknown;
  displaySettings: unknown;
  reportExpiryDays: number | null;
}

export interface IncidentAdminRow {
  id: string;
  publicId: string;
  slug: string;
  title: string;
  description: string | null;
  status: string;
  createdAt: string;
  publishedAt: string | null;
  closedAt: string | null;
  updatedAt: string;
  reportCount: number;
  flaggedCount: number;
}

const PUBLIC_SELECT = `
  SELECT i.id, i.public_id AS "publicId", i.canonical_slug AS slug, i.title, i.description,
    i.status::text AS status, i.published_at::text AS "publishedAt", i.updated_at::text AS "updatedAt",
    ST_X(i.initial_center::geometry) AS longitude, ST_Y(i.initial_center::geometry) AS latitude,
    i.initial_zoom::float AS zoom,
    CASE WHEN i.reporting_area IS NULL THEN NULL ELSE ST_AsGeoJSON(i.reporting_area::geometry)::jsonb END AS "reportingArea",
    i.form_schema AS "formSchema", i.display_settings AS "displaySettings",
    i.report_expiry_days AS "reportExpiryDays"
  FROM incidents i
`;

export function findPublicByReference(db: postgres.Sql, slug: string, publicId: string) {
  return db<IncidentPublicRow[]>`${db.unsafe(PUBLIC_SELECT)}
    WHERE i.canonical_slug = ${slug} AND i.public_id = ${publicId}
      AND i.status IN ('live', 'closed')
    LIMIT 1`.then((rows) => rows[0] ?? null);
}

export function findById(db: postgres.Sql, id: string) {
  return db<IncidentPublicRow[]>`${db.unsafe(PUBLIC_SELECT)} WHERE i.id = ${id} LIMIT 1`.then(
    (rows) => rows[0] ?? null,
  );
}

export function listForAdmin(db: postgres.Sql) {
  return db<IncidentAdminRow[]>`
    SELECT i.id, i.public_id AS "publicId", i.canonical_slug AS slug, i.title, i.description,
      i.status::text AS status, i.created_at::text AS "createdAt",
      i.published_at::text AS "publishedAt", i.closed_at::text AS "closedAt",
      i.updated_at::text AS "updatedAt",
      (SELECT count(*)::int FROM reports r WHERE r.incident_id = i.id) AS "reportCount",
      (SELECT count(*)::int FROM reports r WHERE r.incident_id = i.id AND r.status = 'flagged') AS "flaggedCount"
    FROM incidents i
    ORDER BY i.updated_at DESC
    LIMIT 200
  `;
}

export function listPublicLive(db: postgres.Sql) {
  return db<
    { reference: string; title: string; description: string | null; publishedAt: string | null }[]
  >`
    SELECT canonical_slug || '-' || public_id AS reference, title, description,
      published_at::text AS "publishedAt"
    FROM incidents
    WHERE status = 'live'
    ORDER BY published_at DESC
    LIMIT 50
  `;
}

export function create(
  db: postgres.Sql,
  incident: {
    publicId: string;
    slug: string;
    title: string;
    description: string | null;
    formSchema: unknown;
    longitude: number;
    latitude: number;
    zoom: number;
    reportingAreaGeoJson: string | null;
    reportExpiryDays: number | null;
  },
) {
  const point = `SRID=4326;POINT(${incident.longitude} ${incident.latitude})`;
  return db<{ id: string; slug: string; publicId: string }[]>`
    INSERT INTO incidents (public_id, canonical_slug, title, description, form_schema,
      initial_center, initial_zoom, reporting_area, report_expiry_days)
    VALUES (${incident.publicId}, ${incident.slug}, ${incident.title}, ${incident.description},
      ${db.json(incident.formSchema as never)}, ST_GeogFromText(${point}), ${incident.zoom},
      CASE WHEN ${incident.reportingAreaGeoJson}::text IS NULL THEN NULL
        ELSE ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(${incident.reportingAreaGeoJson}), 4326))::geography END,
      ${incident.reportExpiryDays})
    RETURNING id, canonical_slug AS slug, public_id AS "publicId"
  `.then((rows) => rows[0]);
}

export function publish(db: postgres.Sql, id: string) {
  return db<{ id: string }[]>`
    UPDATE incidents SET status = 'live', published_at = now(), updated_at = now()
    WHERE id = ${id} AND status = 'draft'
    RETURNING id
  `.then((rows) => rows.length > 0);
}

export function close(db: postgres.Sql, id: string) {
  return db<{ id: string }[]>`
    UPDATE incidents SET status = 'closed', closed_at = now(), updated_at = now()
    WHERE id = ${id} AND status = 'live'
    RETURNING id
  `.then((rows) => rows.length > 0);
}

export interface IncidentDetailRow extends IncidentPublicRow {
  closedAt: string | null;
  createdAt: string;
}

export function findByIdForAdmin(db: postgres.Sql, id: string) {
  return db<IncidentDetailRow[]>`
    SELECT i.id, i.public_id AS "publicId", i.canonical_slug AS slug, i.title, i.description,
      i.status::text AS status, i.published_at::text AS "publishedAt",
      i.created_at::text AS "createdAt",
      i.closed_at::text AS "closedAt",
      i.updated_at::text AS "updatedAt",
      ST_X(i.initial_center::geometry) AS longitude, ST_Y(i.initial_center::geometry) AS latitude,
      i.initial_zoom::float AS zoom,
      CASE WHEN i.reporting_area IS NULL THEN NULL ELSE ST_AsGeoJSON(i.reporting_area::geometry)::jsonb END AS "reportingArea",
      i.form_schema AS "formSchema", i.display_settings AS "displaySettings",
      i.report_expiry_days AS "reportExpiryDays"
    FROM incidents i
    WHERE i.id = ${id}
    LIMIT 1
  `.then((rows) => rows[0] ?? null);
}

export function update(
  db: postgres.Sql,
  id: string,
  update: {
    title?: string;
    description?: string;
    longitude?: number;
    latitude?: number;
    zoom?: number;
    reportingAreaGeoJson?: string | null;
    displaySettings?: unknown;
    reportExpiryDays?: number | null;
    formSchema?: unknown;
  },
) {
  return db.begin(async (tx) => {
    const clauses: ReturnType<typeof tx>[] = [];

    if (update.title !== undefined) clauses.push(tx`title = ${update.title}`);
    if (update.description !== undefined) clauses.push(tx`description = ${update.description}`);
    if (update.longitude !== undefined && update.latitude !== undefined) {
      const point = `SRID=4326;POINT(${update.longitude} ${update.latitude})`;
      clauses.push(tx`initial_center = ST_GeogFromText(${point})`);
    }
    if (update.zoom !== undefined) clauses.push(tx`initial_zoom = ${update.zoom}`);
    if (update.reportingAreaGeoJson !== undefined) {
      if (update.reportingAreaGeoJson === null) {
        clauses.push(tx`reporting_area = NULL`);
      } else {
        clauses.push(tx`reporting_area = ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(${update.reportingAreaGeoJson}), 4326))::geography`);
      }
    }
    if (update.displaySettings !== undefined) {
      clauses.push(tx`display_settings = ${tx.json(update.displaySettings as never)}`);
    }
    if (update.reportExpiryDays !== undefined) {
      clauses.push(tx`report_expiry_days = ${update.reportExpiryDays}`);
    }
    if (update.formSchema !== undefined) {
      clauses.push(tx`form_schema = ${tx.json(update.formSchema as never)}`);
    }

    if (clauses.length === 0) return false;
    clauses.push(tx`updated_at = now()`);
    const setClause = clauses.reduce((acc, fragment) => tx`${acc}, ${fragment}`);
    const rows = await tx<{ id: string }[]>`UPDATE incidents SET ${setClause} WHERE id = ${id} RETURNING id`;
    return rows.length > 0;
  });
}

export function geofenceAllows(db: postgres.Sql, incidentId: string, pointWkt: string) {
  return db<{ allowed: boolean }[]>`
    SELECT reporting_area IS NULL OR ST_Covers(reporting_area, ST_GeogFromText(${pointWkt})) AS allowed
    FROM incidents WHERE id = ${incidentId}
  `.then((rows) => Boolean(rows[0]?.allowed));
}
