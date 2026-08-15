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
  const [privacy, setPrivacy] = useState('');
  const [suspiciousReason, setSuspiciousReason] = useState('');
  const [hasPhoto, setHasPhoto] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');
  const [selectedReport, setSelectedReport] = useState<QueueReport | null>(null);
  const [revealedLocation, setRevealedLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const limit = 25;

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (incidentId) params.set('incidentId', incidentId);
    if (status) params.set('status', status);
    if (privacy) params.set('privacy', privacy);
    if (suspiciousReason) params.set('suspiciousReason', suspiciousReason);
    if (hasPhoto) params.set('hasPhoto', 'true');
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
    setSelectedReport(null);
    setRevealedLocation(null);
  }, [incidentId, status, privacy, suspiciousReason, hasPhoto, page]);

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
    let actionNote = note;
    if (action === 'reject' || action === 'remove') {
      if (
        !window.confirm(
          `${action === 'remove' ? 'Remove' : 'Reject'} this report? This is a destructive moderation action.`,
        )
      )
        return;
      if (!actionNote) actionNote = window.prompt('Add a moderation note (recommended):', '') ?? '';
    }
    const response = await fetch(`/api/admin/reports/${reportId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
      body: JSON.stringify({ action, note: actionNote || undefined }),
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
    let actionNote = note;
    if (action === 'reject' || action === 'remove') {
      if (
        !window.confirm(
          `${action === 'remove' ? 'Remove' : 'Reject'} ${selected.size} selected reports?`,
        )
      )
        return;
      if (!actionNote) actionNote = window.prompt('Add a moderation note (recommended):', '') ?? '';
    }
    const response = await fetch('/api/admin/reports/batch-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
      body: JSON.stringify({ reportIds: [...selected], action, note: actionNote || undefined }),
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
    <main className="shell admin-shell">
      <div className="page-header">
        <div className="page-header-main">
          <p className="eyebrow">Administration</p>
          <h1 className="page-title">Moderation queue</h1>
        </div>
        <a className="button button-secondary button-sm" href="/admin">
          Back to dashboard
        </a>
      </div>

      <div className="card">
        <div className="u-filter-row">
          <label className="field u-min220">
            Incident
            <select
              value={incidentId}
              onChange={(event) => {
                setIncidentId(event.target.value);
                setPage(0);
              }}
            >
              <option value="">All incidents</option>
              {incidents.map((incident) => (
                <option key={incident.id} value={incident.id}>
                  {incident.title}
                </option>
              ))}
            </select>
          </label>
          <label className="field u-min200">
            Status
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(0);
              }}
            >
              <option value="">All statuses</option>
              <option value="flagged">Flagged</option>
              <option value="unverified">Unverified</option>
              <option value="verified">Verified</option>
              <option value="resolved">Resolved</option>
              <option value="rejected">Rejected</option>
              <option value="removed">Removed</option>
            </select>
          </label>
          <label className="field u-min160">
            Privacy
            <select
              value={privacy}
              onChange={(event) => {
                setPrivacy(event.target.value);
                setPage(0);
              }}
            >
              <option value="">All</option>
              <option value="approximate">Approximate</option>
              <option value="exact">Exact</option>
            </select>
          </label>
          <label className="field u-min180">
            Suspicious reason
            <select
              value={suspiciousReason}
              onChange={(event) => {
                setSuspiciousReason(event.target.value);
                setPage(0);
              }}
            >
              <option value="">All reasons</option>
              {Object.entries(REASON_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>&nbsp;</span>
            <label>
              <input
                type="checkbox"
                checked={hasPhoto}
                onChange={(event) => {
                  setHasPhoto(event.target.checked);
                  setPage(0);
                }}
              />{' '}
              Has photo
            </label>
          </label>
          <label className="field u-flex-grow-min200">
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
        <div className="card u-wrap-center">
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
              <th className="u-w40">
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
                      <span key={reason} className="chip chip-flagged u-m2">
                        {REASON_LABELS[reason] ?? reason}
                      </span>
                    ))
                  )}
                </td>
                <td className="u-max280">
                  {Object.entries(report.answers).map(([key, value]) => (
                    <div key={key}>
                      <span className="hint">{key.replaceAll('_', ' ')}:</span>{' '}
                      {value && typeof value === 'object' && 'url' in value ? (
                        <img
                          src={(value as { url: string }).url}
                          alt="Uploaded report photo"
                          width={(value as { width?: number }).width}
                          height={(value as { height?: number }).height}
                          className="u-photo-thumb"
                        />
                      ) : Array.isArray(value) ? (
                        value.join(', ')
                      ) : (
                        String(value)
                      )}
                    </div>
                  ))}
                </td>
                <td>
                  <div className="page-actions">
                    <button
                      type="button"
                      className="button button-secondary button-sm"
                      onClick={() => setSelectedReport(report)}
                    >
                      Details
                    </button>
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

      {selectedReport && (
        <aside className="moderation-detail" aria-label="Selected report details">
          <div className="u-detail-header">
            <h2>Report details</h2>
            <button
              type="button"
              className="button button-secondary button-sm"
              onClick={() => {
                setSelectedReport(null);
                setRevealedLocation(null);
              }}
            >
              Close
            </button>
          </div>
          <p>
            <strong>{selectedReport.incidentTitle}</strong> ·{' '}
            {formatRelativeTime(selectedReport.createdAt)}
          </p>
          <p className="hint">
            {selectedReport.placeLabel ?? 'No public place label'} · Privacy:{' '}
            {selectedReport.privacy}
          </p>
          {selectedReport.suspiciousReasons.length > 0 && (
            <p>
              {selectedReport.suspiciousReasons
                .map((reason) => REASON_LABELS[reason] ?? reason)
                .join(', ')}
            </p>
          )}
          <dl>
            {Object.entries(selectedReport.answers).map(([key, value]) => (
              <div key={key}>
                <dt className="hint">{key.replaceAll('_', ' ')}</dt>
                <dd>
                  {Array.isArray(value)
                    ? value.join(', ')
                    : typeof value === 'object'
                      ? '[photo or structured answer]'
                      : String(value)}
                </dd>
              </div>
            ))}
          </dl>
          {revealedLocation ? (
            <p className="notice notice-warn">
              Exact location revealed: {revealedLocation.latitude}, {revealedLocation.longitude}
            </p>
          ) : (
            <button
              type="button"
              className="button button-danger button-sm"
              onClick={async () => {
                if (!window.confirm('Reveal the exact submitted location? This action is audited.'))
                  return;
                const response = await fetch(
                  `/api/admin/reports/${selectedReport.id}/true-location`,
                );
                if (!response.ok) {
                  setError('Could not reveal the exact location');
                  return;
                }
                const data = (await response.json()) as {
                  location: { latitude: number; longitude: number };
                };
                setRevealedLocation(data.location);
              }}
            >
              Reveal exact location
            </button>
          )}
          <div className="buttons">
            {ACTIONS.map((action) => (
              <button
                key={action.action}
                type="button"
                className={`button button-sm ${action.className ?? 'button-secondary'}`}
                onClick={() => {
                  void act(selectedReport.id, action.action);
                  setSelectedReport(null);
                }}
              >
                {action.label}
              </button>
            ))}
          </div>
        </aside>
      )}

      {totalPages > 1 && (
        <div className="buttons u-centered-buttons">
          <button
            type="button"
            className="button button-secondary button-sm"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </button>
          <span className="hint u-hint-sm">
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
