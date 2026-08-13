import type postgres from 'postgres';
import type { ReportStatus } from '@/shared/types';

export interface QueueReportRow {
  id: string;
  incidentId: string;
  incidentTitle: string;
  reference: string;
  status: string;
  suspiciousReasons: string[];
  answers: Record<string, unknown>;
  placeLabel: string | null;
  privacy: string;
  longitude: number;
  latitude: number;
  createdAt: string;
  updatedAt: string;
}

export function listQueue(
  db: postgres.Sql,
  options: { incidentId?: string; statuses?: ReportStatus[]; limit?: number },
) {
  const limit = Math.min(options.limit ?? 200, 500);
  const incidentFilter = options.incidentId ? db`r.incident_id = ${options.incidentId}` : db`TRUE`;
  const statusFilter =
    options.statuses && options.statuses.length > 0
      ? db`r.status::text = ANY(${options.statuses})`
      : db`TRUE`;
  return db<QueueReportRow[]>`
    SELECT r.id, r.incident_id AS "incidentId", i.title AS "incidentTitle",
      i.canonical_slug || '-' || i.public_id AS reference,
      r.status::text AS status, r.suspicious_reasons AS "suspiciousReasons",
      r.answers, r.public_place_label AS "placeLabel", r.location_privacy::text AS privacy,
      ST_X(r.public_coordinate::geometry) AS longitude,
      ST_Y(r.public_coordinate::geometry) AS latitude,
      r.created_at::text AS "createdAt", r.updated_at::text AS "updatedAt"
    FROM reports r
    JOIN incidents i ON i.id = r.incident_id
    WHERE ${incidentFilter} AND ${statusFilter}
    ORDER BY r.updated_at DESC
    LIMIT ${limit}
  `;
}

export function setStatus(db: postgres.Sql, reportId: string, status: ReportStatus) {
  return db<{ incidentId: string }[]>`
    UPDATE reports SET status = ${status},
      resolved_at = CASE WHEN ${status}::report_status = 'resolved' THEN now() ELSE NULL END,
      updated_at = now()
    WHERE id = ${reportId}
    RETURNING incident_id AS "incidentId"
  `.then((rows) => rows[0]?.incidentId ?? null);
}
