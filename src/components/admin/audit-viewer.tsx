'use client';
import { useCallback, useEffect, useState } from 'react';

interface AuditEvent {
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

const EVENT_LABELS: Record<string, string> = {
  admin_login: 'Admin login',
  admin_bootstrapped: 'Admin bootstrapped',
  admin_role_changed: 'Admin role changed',
  admin_removed: 'Admin removed',
  incident_created: 'Incident created',
  incident_published: 'Incident published',
  incident_closed: 'Incident closed',
  incident_updated: 'Incident updated',
  incident_archived: 'Incident archived',
  report_created: 'Report created',
  report_status_changed: 'Status changed',
  report_edit_viewed: 'Report edit viewed',
  report_deleted_by_owner: 'Report deleted by owner',
  true_location_viewed: 'True location viewed',
};

export function AuditViewer() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(0);
  const limit = 50;

  const load = useCallback(async () => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(page * limit) });
    if (filter) params.set('incidentId', filter);
    const res = await fetch(`/api/admin/audit?${params}`);
    if (!res.ok) return;
    const data = (await res.json()) as { events: AuditEvent[] };
    setEvents(data.events);
  }, [filter, page]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="shell">
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <p className="eyebrow">
            <a href="/admin" style={{ color: 'inherit' }}>
              Admin
            </a>{' '}
            / Audit log
          </p>
          <h1 className="page-title">Audit log</h1>
        </div>
        <div className="buttons" style={{ marginTop: 0 }}>
          <label className="field" style={{ margin: 0 }}>
            Filter by incident ID
            <input
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setPage(0);
              }}
              placeholder="UUID (optional)"
              style={{ maxWidth: 280 }}
            />
          </label>
        </div>
      </div>

      <section className="card">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Time</th>
                <th>Event</th>
                <th>Actor</th>
                <th>Incident</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td className="hint" style={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                    {new Date(event.createdAt).toLocaleString()}
                  </td>
                  <td>
                    <span className="chip" style={{ fontSize: '0.78rem' }}>
                      {EVENT_LABELS[event.eventType] ?? event.eventType}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.82rem' }}>
                    {event.actorType}
                    {event.actorId ? (
                      <span className="hint"> ({event.actorId.slice(0, 8)}...)</span>
                    ) : null}
                  </td>
                  <td style={{ fontSize: '0.82rem' }}>
                    {event.incidentTitle ?? <span className="hint">-</span>}
                  </td>
                  <td style={{ fontSize: '0.82rem' }}>
                    {Object.keys(event.metadata).length > 0 ? (
                      <span style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>
                        {JSON.stringify(event.metadata)}
                      </span>
                    ) : (
                      <span className="hint">-</span>
                    )}
                  </td>
                </tr>
              ))}
              {events.length === 0 && (
                <tr>
                  <td colSpan={5} className="hint">
                    No audit events found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="buttons" style={{ marginTop: '0.6rem' }}>
          <button
            type="button"
            className="button button-secondary button-sm"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </button>
          <span className="hint" style={{ fontSize: '0.82rem' }}>
            Page {page + 1}
          </span>
          <button
            type="button"
            className="button button-secondary button-sm"
            disabled={events.length < limit}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      </section>
    </main>
  );
}
