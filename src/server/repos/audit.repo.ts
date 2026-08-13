import type postgres from 'postgres';

export interface AuditEventInput {
  incidentId?: string | null;
  reportId?: string | null;
  actorType: 'public' | 'admin' | 'system';
  actorId?: string | null;
  eventType: string;
  metadata?: Record<string, unknown>;
}

export function record(db: postgres.Sql, event: AuditEventInput) {
  return db`
    INSERT INTO audit_events (incident_id, report_id, actor_type, actor_id, event_type, metadata)
    VALUES (${event.incidentId ?? null}, ${event.reportId ?? null}, ${event.actorType},
      ${event.actorId ?? null}, ${event.eventType}, ${db.json((event.metadata ?? {}) as never)})
  `;
}

export function listForIncident(db: postgres.Sql, incidentId: string, limit = 200) {
  return db<
    {
      eventType: string;
      actorType: string;
      reportId: string | null;
      metadata: Record<string, unknown>;
      createdAt: string;
    }[]
  >`
    SELECT event_type AS "eventType", actor_type::text AS "actorType",
      report_id AS "reportId", metadata, created_at::text AS "createdAt"
    FROM audit_events
    WHERE incident_id = ${incidentId}
    ORDER BY created_at DESC
    LIMIT ${Math.min(limit, 500)}
  `;
}

export interface AuditEventRow {
  id: string;
  incidentId: string | null;
  incidentTitle: string | null;
  reportId: string | null;
  actorType: string;
  actorId: string | null;
  eventType: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export function listGlobal(
  db: postgres.Sql,
  options: { incidentId?: string; limit?: number; offset?: number } = {},
) {
  const limit = Math.min(options.limit ?? 100, 500);
  const offset = options.offset ?? 0;
  return db<AuditEventRow[]>`
    SELECT a.id, a.incident_id AS "incidentId",
      i.title AS "incidentTitle",
      a.report_id AS "reportId",
      a.actor_type::text AS "actorType", a.actor_id AS "actorId",
      a.event_type AS "eventType", a.metadata,
      a.created_at::text AS "createdAt"
    FROM audit_events a
    LEFT JOIN incidents i ON i.id = a.incident_id
    ${options.incidentId ? db`WHERE a.incident_id = ${options.incidentId}` : db``}
    ORDER BY a.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
}
