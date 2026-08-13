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
  const [trueLocations, setTrueLocations] = useState<
    Record<string, { latitude: number; longitude: number; submittedPlaceLabel: string | null }>
  >({});

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (incidentId) params.set('incidentId', incidentId);
    if (status) params.set('status', status);
    const response = await fetch(`/api/admin/reports?${params}`);
    if (!response.ok) {
      setError('Could not load the moderation queue');
      return;
    }
    const data = (await response.json()) as { reports: QueueReport[] };
    setReports(data.reports);
    setError('');
  }, [incidentId, status]);

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
      body: JSON.stringify({ action }),
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? 'Action failed');
      return;
    }
    void load();
  }

  async function revealTrueLocation(reportId: string) {
    const response = await fetch(`/api/admin/reports/${reportId}/true-location`);
    if (!response.ok) {
      setError('Could not load the true location');
      return;
    }
    const data = (await response.json()) as {
      location: { latitude: number; longitude: number; submittedPlaceLabel: string | null };
    };
    setTrueLocations((previous) => ({ ...previous, [reportId]: data.location }));
  }

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
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <label className="field" style={{ minWidth: 220 }}>
            Incident
            <select value={incidentId} onChange={(event) => setIncidentId(event.target.value)}>
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
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">All statuses</option>
              <option value="flagged">Flagged</option>
              <option value="unverified">Unverified</option>
              <option value="verified">Verified</option>
              <option value="resolved">Resolved</option>
              <option value="rejected">Rejected</option>
              <option value="removed">Removed</option>
            </select>
          </label>
        </div>
      </div>

      {error && <p className="notice notice-error">{error}</p>}

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Report</th>
              <th>Incident</th>
              <th>Status</th>
              <th>Signals</th>
              <th>Answers</th>
              <th>True location</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((report) => {
              const revealed = trueLocations[report.id];
              return (
                <tr key={report.id}>
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
                    {revealed ? (
                      <span className="hint">
                        {revealed.latitude.toFixed(5)}, {revealed.longitude.toFixed(5)}
                        {revealed.submittedPlaceLabel ? ` (${revealed.submittedPlaceLabel})` : ''}
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="button button-secondary button-sm"
                        onClick={() => revealTrueLocation(report.id)}
                      >
                        Reveal (audited)
                      </button>
                    )}
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
              );
            })}
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
    </main>
  );
}
