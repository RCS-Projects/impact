import type postgres from 'postgres';

export interface EditableReportRow {
  answers: Record<string, unknown>;
  locationPrivacy: string;
  latitude: number;
  longitude: number;
  publicLatitude: number;
  publicLongitude: number;
  placeLabel: string | null;
  editTokenHash: string;
  formSchema: unknown;
  status: string;
  incidentId: string;
  incidentStatus: string;
  incidentTitle: string;
  reference: string;
  reportingArea: unknown | null;
}

export function insertLocation(
  db: postgres.Sql,
  reportId: string,
  pointWkt: string,
  placeLabel: string | null,
) {
  return db`
    INSERT INTO report_private_locations (report_id, submitted_coordinate, submitted_place_label)
    VALUES (${reportId}, ST_GeogFromText(${pointWkt}), ${placeLabel})
  `;
}

export function getForEdit(db: postgres.Sql, reportId: string) {
  return db<EditableReportRow[]>`
    SELECT r.answers, r.location_privacy::text AS "locationPrivacy",
      ST_Y(p.submitted_coordinate::geometry) AS latitude,
      ST_X(p.submitted_coordinate::geometry) AS longitude,
      ST_Y(r.public_coordinate::geometry) AS "publicLatitude",
      ST_X(r.public_coordinate::geometry) AS "publicLongitude",
      p.submitted_place_label AS "placeLabel",
      r.edit_token_hash AS "editTokenHash", r.schema_snapshot AS "formSchema",
      r.status::text AS status, r.incident_id AS "incidentId",
      i.status::text AS "incidentStatus", i.title AS "incidentTitle",
      i.canonical_slug || '-' || i.public_id AS reference,
      CASE WHEN i.reporting_area IS NULL THEN NULL ELSE ST_AsGeoJSON(i.reporting_area::geometry)::jsonb END AS "reportingArea"
    FROM reports r
    JOIN report_private_locations p ON p.report_id = r.id
    JOIN incidents i ON i.id = r.incident_id
    WHERE r.id = ${reportId}
    LIMIT 1
  `.then((rows) => rows[0] ?? null);
}

export function update(
  db: postgres.Sql,
  reportId: string,
  update: {
    answers: unknown;
    privacy: 'exact' | 'approximate';
    publicPointWkt: string;
    radius: number | null;
    privatePointWkt: string;
    placeLabel: string | null;
    status?: string;
    suspiciousReasons?: string[];
  },
) {
  return db.begin(async (tx) => {
    const sets = [
      tx`answers = ${tx.json(update.answers as never)}`,
      tx`location_privacy = ${update.privacy}`,
      tx`public_coordinate = ST_GeogFromText(${update.publicPointWkt})`,
      tx`privacy_radius_meters = ${update.radius}`,
    ];
    if (update.status) sets.push(tx`status = ${update.status}`);
    if (update.suspiciousReasons)
      sets.push(
        tx`suspicious_reasons = suspicious_reasons || ${tx.json(update.suspiciousReasons as never)}`,
      );
    sets.push(tx`updated_at = now()`);
    const setClause = sets.reduce((acc, fragment) => tx`${acc}, ${fragment}`);
    await tx`UPDATE reports SET ${setClause} WHERE id = ${reportId}`;
    await tx`
      UPDATE report_private_locations
      SET submitted_coordinate = ST_GeogFromText(${update.privatePointWkt}),
        submitted_place_label = ${update.placeLabel}, updated_at = now()
      WHERE report_id = ${reportId}
    `;
  });
}

export function getTrueLocation(db: postgres.Sql, reportId: string) {
  return db<
    {
      latitude: number;
      longitude: number;
      submittedPlaceLabel: string | null;
      incidentTitle: string;
    }[]
  >`
    SELECT ST_Y(p.submitted_coordinate::geometry) AS latitude,
      ST_X(p.submitted_coordinate::geometry) AS longitude,
      p.submitted_place_label AS "submittedPlaceLabel",
      i.title AS "incidentTitle"
    FROM report_private_locations p
    JOIN reports r ON r.id = p.report_id
    JOIN incidents i ON i.id = r.incident_id
    WHERE p.report_id = ${reportId}
    LIMIT 1
  `.then((rows) => rows[0] ?? null);
}
