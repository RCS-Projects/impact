'use client';
import { useCallback, useEffect, useState } from 'react';
import { STATUS_LABELS, type ReportStatus } from '@/shared/types';
import { getCsrfToken } from '@/lib/csrf';
import { formatRelativeTime } from '@/lib/format';

interface QueueReport {
  id: string;
  incidentId: string;
  incidentTitle: string;
  reference: string;
  status: ReportStatus;
  suspiciousReasons: string[];
  answers: Record<string, unknown>;
  placeLabel: string | null;
  privacy: string;
  createdAt: string;
}

interface IncidentOption {
  id: string;
  title: string;
}

const ACTIONS: { action: string; label: string; className?: string }[] = [
  { action: 'verify', label: 'Verify' },
  { action: 'resolve', label: 'Resolve' },
  { action: 'flag', label: 'Flag' },
  { action: 'reject', label: 'Reject', className: 'button-danger' },
  { action: 'remove', label: 'Remove', className: 'button-danger' },
  { action: 'restore', label: 'Restore' },
];

const REASON_LABELS: Record<string, string> = {
  duplicate_content: 'Duplicate content',
  rapid_submission: 'Rapid submissions',
  captcha_failures: 'CAPTCHA failures',
  implausible_move: 'Implausible location move',
};

export function ModerationApp() {
  const [reports, setReports] = useState<QueueReport[]>([]);
  const [incidents, setIncidents] = useState<IncidentOption[]>([]);
  const [incidentId, setIncidentId] = useState('');
  const [status, setStatus] = useState('flagged');
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');
  const limit = 25;

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (incidentId) params.set('incidentId', incidentId);
    if (status) params.set('status', status);
    params.set('page', String(page));
    params.set('limit', String(limit));
    const response = await fetch(`/api/admin/reports?${params}`);
    if (!response.ok) {
      setError('Could not load the moderation queue');
      return;
    }
    const data = (await response.json()) as { reports: QueueReport[]; total: number };
    setReports(data.reports);
    setTotal(data.total);
    setError('');
    setSelected(new Set());
  }, [incidentId, status, page]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void (async () => {
      const response = await fetch('/api/admin/incidents');
      if (!response.ok) return;
      const data = (await response.json()) as { incidents: IncidentOption[] };
      setIncidents(data.incidents);
    })();
  }, []);

  async function act(reportId: string, action: string) {
    const response = await fetch(`/api/admin/reports/${reportId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
      body: JSON.stringify({ action, note: note || undefined }),
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? 'Action failed');
      return;
    }
    setNote('');
    void load();
  }

  async function batchAct(action: string) {
    if (selected.size === 0) return;
    const response = await fetch('/api/admin/reports/batch-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
      body: JSON.stringify({ reportIds: [...selected], action, note: note || undefined }),
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? 'Batch action failed');
      return;
    }
    setNote('');
    void load();
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === reports.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(reports.map((r) => r.id)));
    }
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <main className="shell" style={{ maxWidth: 1100 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <p className="eyebrow">Administration</p>
          <h1 className="page-title">Moderation queue</h1>
        </div>
        <a className="button button-secondary button-sm" href="/admin">
          Back to dashboard
        </a>
      </div>

      <div className="card">
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label className="field" style={{ minWidth: 220 }}>
            Incident
            <select value={incidentId} onChange={(event) => { setIncidentId(event.target.value); setPage(0); }}>
              <option value="">All incidents</option>
              {incidents.map((incident) => (
                <option key={incident.id} value={incident.id}>
                  {incident.title}
                </option>
              ))}
            </select>
          </label>
          <label className="field" style={{ minWidth: 200 }}>
            Status
            <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(0); }}>
              <option value="">All statuses</option>
              <option value="flagged">Flagged</option>
              <option value="unverified">Unverified</option>
              <option value="verified">Verified</option>
              <option value="resolved">Resolved</option>
              <option value="rejected">Rejected</option>
              <option value="removed">Removed</option>
            </select>
          </label>
          <label className="field" style={{ flex: 1, minWidth: 200 }}>
            Note (optional)
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a note to this action..."
              maxLength={500}
            />
          </label>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span className="hint">{selected.size} selected</span>
          {ACTIONS.map((action) => (
            <button
              key={action.action}
              type="button"
              className={`button button-sm ${action.className ?? 'button-secondary'}`}
              onClick={() => void batchAct(action.action)}
            >
              Batch {action.label}
            </button>
          ))}
        </div>
      )}

      {error && <p className="notice notice-error">{error}</p>}

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th style={{ width: 40 }}>
                <input
                  type="checkbox"
                  checked={selected.size === reports.length && reports.length > 0}
                  onChange={toggleSelectAll}
                />
              </th>
              <th>Report</th>
              <th>Incident</th>
              <th>Status</th>
              <th>Signals</th>
              <th>Answers</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((report) => (
              <tr key={report.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={selected.has(report.id)}
                    onChange={() => toggleSelect(report.id)}
                  />
                </td>
                <td>
                  {report.placeLabel ?? 'No label'}
                  <br />
                  <span className="hint">
                    {formatRelativeTime(report.createdAt)} · {report.privacy}
                  </span>
                </td>
                <td>{report.incidentTitle}</td>
                <td>
                  <span className={`chip chip-${report.status}`}>
                    {STATUS_LABELS[report.status]}
                  </span>
                </td>
                <td>
                  {report.suspiciousReasons.length === 0 ? (
                    <span className="hint">none</span>
                  ) : (
                    report.suspiciousReasons.map((reason) => (
                      <span key={reason} className="chip chip-flagged" style={{ margin: 2 }}>
                        {REASON_LABELS[reason] ?? reason}
                      </span>
                    ))
                  )}
                </td>
                <td style={{ maxWidth: 280 }}>
                  {Object.entries(report.answers).map(([key, value]) => (
                    <div key={key}>
                      <span className="hint">{key.replaceAll('_', ' ')}:</span>{' '}
                      {Array.isArray(value) ? value.join(', ') : String(value)}
                    </div>
                  ))}
                </td>
                <td>
                  <div className="buttons" style={{ marginTop: 0 }}>
                    {ACTIONS.map((action) => (
                      <button
                        key={action.action}
                        type="button"
                        className={`button button-sm ${action.className ?? 'button-secondary'}`}
                        onClick={() => act(report.id, action.action)}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
            {reports.length === 0 && (
              <tr>
                <td colSpan={7} className="hint">
                  No reports match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="buttons" style={{ marginTop: '0.6rem', justifyContent: 'center' }}>
          <button
            type="button"
            className="button button-secondary button-sm"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </button>
          <span className="hint" style={{ fontSize: '0.82rem' }}>
            Page {page + 1} of {totalPages} ({total} total)
          </span>
          <button
            type="button"
            className="button button-secondary button-sm"
            disabled={page >= totalPages - 1}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      )}
    </main>
  );
}
