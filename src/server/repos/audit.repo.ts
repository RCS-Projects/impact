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
