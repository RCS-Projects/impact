'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getCsrfToken } from '@/lib/csrf';
import { PolygonEditor } from '@/components/admin/polygon-editor';

interface AdminIncident {
  id: string;
  publicId: string;
  slug: string;
  title: string;
  status: string;
  createdAt: string;
  publishedAt: string | null;
  reportCount: number;
  flaggedCount: number;
}

interface TemplateOption {
  key: string;
  title: string;
}
interface DashboardStats { liveIncidents: number; flaggedReports: number; recentReports: number; pendingUploads: number }

async function adminApi(path: string, body: unknown) {
  return fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
    body: JSON.stringify(body),
  });
}

export function AdminApp({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [incidents, setIncidents] = useState<AdminIncident[]>([]);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [templateKey, setTemplateKey] = useState('storm-damage');
  const [reportingArea, setReportingArea] = useState<unknown | null>(null);
  const [reportingAreaError, setReportingAreaError] = useState('');
  const [stats, setStats] = useState<DashboardStats | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch('/api/admin/incidents');
    if (!response.ok) return;
    const data = (await response.json()) as { incidents: AdminIncident[]; stats: DashboardStats };
    setIncidents(data.incidents);
    setStats(data.stats);
  }, []);

  const loadTemplates = useCallback(async () => {
    const response = await fetch('/api/admin/templates');
    if (!response.ok) return;
    const data = (await response.json()) as { templates: TemplateOption[] };
    setTemplates(data.templates);
  }, []);

  useEffect(() => {
    if (signedIn) {
      void refresh();
      void loadTemplates();
    }
  }, [signedIn, refresh, loadTemplates]);

  async function login(form: FormData) {
    setMessage('');
    const response = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: form.get('login'), password: form.get('password') }),
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      setMessage(data.error ?? 'Could not sign in');
      return;
    }
    window.location.assign('/admin');
  }

  async function logout() {
    await fetch('/api/admin/logout', {
      method: 'POST',
      headers: { 'x-csrf-token': getCsrfToken() },
    });
    window.location.assign('/admin');
  }

  async function create(form: FormData) {
    setMessage('');
    const response = await adminApi('/api/admin/incidents', {
      title: form.get('title'),
      description: String(form.get('description') ?? '') || undefined,
      templateKey: templateKey,
      center: {
        latitude: Number(form.get('latitude')),
        longitude: Number(form.get('longitude')),
        zoom: Number(form.get('zoom')),
      },
      reportingArea,
      reportExpiryDays: form.get('reportExpiryDays') ? Number(form.get('reportExpiryDays')) : undefined,
      reportGeometryMode: form.get('reportGeometryMode') || 'point',
    });
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
      id?: string;
      url?: string;
    };
    if (!response.ok) {
      setMessage(data.error ?? 'Could not create incident');
      return;
    }
    setMessage(`Draft created: ${data.url}`);
    setReportingArea(null);
    await refresh();
  }

  async function act(incidentId: string, action: 'publish' | 'close' | 'archive') {
    const consequence = action === 'publish' ? 'make this map public' : action === 'close' ? 'stop accepting new reports' : 'archive this incident';
    if (!window.confirm(`Are you sure you want to ${action} this incident and ${consequence}?`)) return;
    setMessage('');
    const response = await adminApi(`/api/admin/incidents/${incidentId}/${action}`, {});
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      setMessage(data.error ?? `Could not ${action} incident`);
      return;
    }
    await refresh();
  }

  async function duplicateIncident(incidentId: string) {
    if (!window.confirm('Create a new draft copy of this incident?')) return;
    const response = await adminApi(`/api/admin/incidents/${incidentId}/duplicate`, {});
    const data = (await response.json().catch(() => ({}))) as { error?: string; id?: string };
    if (!response.ok || !data.id) { setMessage(data.error ?? 'Could not duplicate incident'); return; }
    router.push(`/admin/incidents/${data.id}`);
  }

  if (!signedIn) {
    return (
      <main className="shell">
        <p className="eyebrow">Administration</p>
        <h1 className="page-title">Sign in</h1>
        <form action={login} className="form-block" style={{ maxWidth: 420 }}>
          <label className="field">
            Login
            <input name="login" autoComplete="username" required />
          </label>
          <label className="field">
            Password
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <button className="button">Sign in</button>
          {message && <p className="notice notice-error">{message}</p>}
        </form>
      </main>
    );
  }

  return (
    <main className="shell">
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <p className="eyebrow">Administration</p>
          <h1 className="page-title">Incident maps</h1>
        </div>
        <div className="buttons" style={{ marginTop: 0 }}>
          <a className="button button-secondary button-sm" href="/admin/templates">
            Templates
          </a>
          <a className="button button-secondary button-sm" href="/admin/moderation">
            Moderation queue
          </a>
          <a className="button button-secondary button-sm" href="/admin/audit">
            Audit log
          </a>
          <a className="button button-secondary button-sm" href="/admin/users">
            Users
          </a>
          <button type="button" className="button button-secondary button-sm" onClick={logout}>
            Sign out
          </button>
        </div>
      </div>

      {message && <p className="notice">{message}</p>}

      {stats && <div className="grid-4" style={{ marginBottom: '1rem' }}>
        <div className="card"><strong>{stats.liveIncidents}</strong><span className="hint"> live incidents</span></div>
        <div className="card"><strong>{stats.flaggedReports}</strong><span className="hint"> flagged reports</span></div>
        <div className="card"><strong>{stats.recentReports}</strong><span className="hint"> reports in the last hour</span></div>
        <div className="card"><strong>{stats.pendingUploads}</strong><span className="hint"> pending uploads</span></div>
      </div>}

      <section className="card">
        <h2>Create incident</h2>
        <form action={create} className="form-block">
          <label className="field">
            Title
            <input name="title" required maxLength={160} />
          </label>
          <label className="field">
            Description
            <textarea name="description" maxLength={4000} />
          </label>
          <label className="field">
            Template
            <select name="templateKey" value={templateKey} onChange={(event) => setTemplateKey(event.target.value)}>
              {templates.map((t) => (
                <option key={t.key} value={t.key}>{t.title}</option>
              ))}
              {templates.length === 0 && (
                <>
                  <option value="storm-damage">Storm Damage</option>
                  <option value="cellular-outage">Cellular Outage</option>
                </>
              )}
            </select>
          </label>
          <label className="field">
            Report expiry (days)
            <input name="reportExpiryDays" type="number" min={1} max={365} placeholder="No expiry" />
          </label>
          <label className="field">
            Report geometry
            <select name="reportGeometryMode" defaultValue="point">
              <option value="point">Point reports</option>
              <option value="polygon">Polygon reports</option>
              <option value="point_or_polygon">Point or polygon reports</option>
            </select>
            <span className="hint">Choose whether participants mark one location, draw an area, or may choose either.</span>
          </label>
          <div className="grid-3">
            <label className="field">
              Latitude
              <input name="latitude" type="number" step="any" required defaultValue="45.4215" />
            </label>
            <label className="field">
              Longitude
              <input name="longitude" type="number" step="any" required defaultValue="-75.6972" />
            </label>
            <label className="field">
              Zoom
              <input name="zoom" type="number" min="3" max="18" required defaultValue="10" />
            </label>
          </div>
          <label className="field">
            Reporting area
            <span className="hint">
              Draw the reporting boundary on the map, or paste GeoJSON below.
            </span>
            <PolygonEditor
              center={[-75.6972, 45.4215]}
              value={
                reportingArea &&
                typeof reportingArea === 'object' &&
                (reportingArea as { type?: string }).type === 'Polygon'
                  ? ((reportingArea as { coordinates: [number, number][] }).coordinates[0] as unknown as [number, number][])
                  : null
              }
              onChange={(coords) => {
                setReportingAreaError('');
                if (!coords || coords.length < 3) {
                  setReportingArea(null);
                } else {
                  setReportingArea({ type: 'Polygon', coordinates: [coords] });
                }
              }}
            />
            <textarea
              value={reportingArea ? JSON.stringify(reportingArea) : ''}
              onChange={(e) => {
                const raw = e.target.value.trim();
                if (!raw) { setReportingArea(null); return; }
                try { setReportingAreaError(''); setReportingArea(JSON.parse(raw)); } catch { setReportingAreaError('Enter valid GeoJSON before creating the incident.'); }
              }}
              rows={4}
              placeholder='{"type":"Polygon","coordinates":[[...]]}'
              style={{ marginTop: '0.3rem' }}
            />
            {reportingAreaError && <p className="notice notice-error" role="alert">{reportingAreaError}</p>}
          </label>
          <button className="button" disabled={Boolean(reportingAreaError)}>Create draft</button>
        </form>
      </section>

      <section className="card">
        <h2>All incidents</h2>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Title</th>
                <th>Status</th>
                <th>Reports</th>
                <th>URL</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((incident) => {
                const url = `/map/${incident.slug}-${incident.publicId}`;
                return (
                  <tr key={incident.id}>
                    <td>{incident.title}</td>
                    <td>
                      <span className={`chip chip-${incident.status}`}>{incident.status}</span>
                      {incident.flaggedCount > 0 && (
                        <span className="chip chip-flagged">{incident.flaggedCount} flagged</span>
                      )}
                    </td>
                    <td>{incident.reportCount}</td>
                    <td>
                      {incident.status === 'draft' ? (
                        <span className="hint">publish first</span>
                      ) : (
                        <a href={url} target="_blank" rel="noreferrer">
                          {url}
                        </a>
                      )}
                    </td>
                    <td>
                      <div className="buttons" style={{ marginTop: 0 }}>
                        <a
                          className="button button-secondary button-sm"
                          href={`/admin/incidents/${incident.id}`}
                        >
                          Edit
                        </a>
                        <a className="button button-secondary button-sm" href={`/admin/moderation?incidentId=${incident.id}`}>Moderate</a>
                        {incident.status !== 'draft' && <a className="button button-secondary button-sm" href={url} target="_blank" rel="noreferrer">View map</a>}
                        <a className="button button-secondary button-sm" href={`/api/admin/incidents/${incident.id}/export?format=csv`} target="_blank" rel="noreferrer">Export</a>
                        <button type="button" className="button button-secondary button-sm" onClick={() => void duplicateIncident(incident.id)}>Duplicate</button>
                        {incident.status === 'draft' && (
                          <button
                            type="button"
                            className="button button-sm"
                            onClick={() => act(incident.id, 'publish')}
                          >
                            Publish
                          </button>
                        )}
                        {incident.status === 'live' && (
                          <button
                            type="button"
                            className="button button-secondary button-sm"
                            onClick={() => act(incident.id, 'close')}
                          >
                            Close
                          </button>
                        )}
                        {incident.status === 'closed' && (
                          <button
                            type="button"
                            className="button button-secondary button-sm"
                            onClick={() => act(incident.id, 'archive')}
                          >
                            Archive
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {incidents.length === 0 && (
                <tr>
                  <td colSpan={5} className="hint">
                    No incidents yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
