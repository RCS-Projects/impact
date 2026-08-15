import type postgres from 'postgres';
import { PUBLIC_VISIBLE_STATUSES, type ReportStatus } from '@/shared/types';

export interface PublicReportRow {
  id: string;
  answers: Record<string, unknown>;
  placeLabel: string | null;
  privacy: string;
  longitude: number;
  latitude: number;
  radius: number | null;
  status: string;
  createdAt: string;
  geometryType: 'Point' | 'Polygon';
  geometry: unknown;
}

export interface ReportBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface PublicQueryOptions {
  statuses: ReportStatus[];
  fieldFilters: Record<string, string[]>;
}

export function insert(
  db: postgres.Sql,
  report: {
    incidentId: string;
    schemaSnapshot: unknown;
    answers: unknown;
    placeLabel: string | null;
    privacy: 'exact' | 'approximate';
    publicPointWkt: string;
    reportGeometryGeoJson: string;
    radius: number | null;
    browserTokenHash: string;
    ipHash: string;
    editTokenHash: string;
    contentHash: string;
    status: ReportStatus;
    suspiciousReasons: string[];
    expiresAt: Date | null;
  },
) {
  return db<{ id: string }[]>`
    INSERT INTO reports (incident_id, schema_snapshot, answers, public_place_label,
      location_privacy, public_coordinate, privacy_radius_meters, browser_token_hash,
      ip_hash, edit_token_hash, content_hash, status, suspicious_reasons, expires_at, report_geometry)
    VALUES (${report.incidentId}, ${db.json(report.schemaSnapshot as never)},
      ${db.json(report.answers as never)}, ${report.placeLabel}, ${report.privacy},
      ST_GeogFromText(${report.publicPointWkt}), ${report.radius}, ${report.browserTokenHash},
      ${report.ipHash}, ${report.editTokenHash}, ${report.contentHash}, ${report.status},
      ${db.json(report.suspiciousReasons as never)}, ${report.expiresAt},
      ST_SetSRID(ST_GeomFromGeoJSON(${report.reportGeometryGeoJson}), 4326)::geography)
    RETURNING id
  `.then((rows) => rows[0]?.id);
}

export function queryPublic(
  db: postgres.Sql,
  incidentId: string,
  bounds: ReportBounds,
  options: PublicQueryOptions,
) {
  const statuses = options.statuses.length > 0 ? options.statuses : PUBLIC_VISIBLE_STATUSES;
  const filterClauses = Object.entries(options.fieldFilters).map(([key, values]) => {
    return db`(answers->>${key} = ANY(${values}) OR answers->${key} ?| ${values})`;
  });
  const where =
    filterClauses.length > 0
      ? filterClauses.reduce((acc, clause) => db`${acc} AND ${clause}`)
      : db`TRUE`;
  return db<PublicReportRow[]>`
    SELECT id, answers, public_place_label AS "placeLabel", location_privacy::text AS privacy,
      ST_X(public_coordinate::geometry) AS longitude, ST_Y(public_coordinate::geometry) AS latitude,
      privacy_radius_meters::float AS radius, status::text AS status, created_at::text AS "createdAt",
      COALESCE(ST_GeometryType(report_geometry::geometry), 'ST_Point')::text AS "geometryType",
      ST_AsGeoJSON(report_geometry::geometry)::jsonb AS geometry
    FROM reports
    WHERE incident_id = ${incidentId}
      AND status::text = ANY(${statuses})
      AND (expires_at IS NULL OR expires_at > now())
      AND report_geometry && ST_MakeEnvelope(${bounds.west}, ${bounds.south}, ${bounds.east}, ${bounds.north}, 4326)::geography
      AND ${where}
    ORDER BY created_at DESC
    LIMIT 500
  `;
}

export function summary(db: postgres.Sql, incidentId: string) {
  return db<{ total: number; lastReportAt: string | null }[]>`
    SELECT count(*)::int AS total, max(created_at)::text AS "lastReportAt"
    FROM reports
    WHERE incident_id = ${incidentId}
      AND status::text = ANY(${PUBLIC_VISIBLE_STATUSES})
      AND (expires_at IS NULL OR expires_at > now())
  `.then((rows) => rows[0] ?? { total: 0, lastReportAt: null });
}

export function contentHashExists(db: postgres.Sql, incidentId: string, contentHash: string) {
  return db<{ id: string }[]>`
    SELECT id FROM reports
    WHERE incident_id = ${incidentId} AND content_hash = ${contentHash}
      AND status NOT IN ('rejected', 'removed')
    LIMIT 1
  `.then((rows) => rows.length > 0);
}

export function countRecentByIp(
  db: postgres.Sql,
  incidentId: string,
  ipHash: string,
  windowMinutes: number,
) {
  return db<{ n: number }[]>`
    SELECT count(*)::int AS n FROM reports
    WHERE incident_id = ${incidentId} AND ip_hash = ${ipHash}
      AND created_at > now() - make_interval(mins => ${windowMinutes})
  `.then((rows) => rows[0]?.n ?? 0);
}

export function findByBrowserHash(db: postgres.Sql, incidentId: string, browserTokenHash: string) {
  return db<{ id: string; status: string }[]>`
    SELECT id, status::text AS status FROM reports
    WHERE incident_id = ${incidentId} AND browser_token_hash = ${browserTokenHash}
    LIMIT 1
  `.then((rows) => rows[0] ?? null);
}
