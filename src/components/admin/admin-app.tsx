'use client';
import { useCallback, useEffect, useState } from 'react';
import { getCsrfToken } from '@/lib/csrf';

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

async function adminApi(path: string, body: unknown) {
  return fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
    body: JSON.stringify(body),
  });
}

export function AdminApp({ signedIn }: { signedIn: boolean }) {
  const [message, setMessage] = useState('');
  const [incidents, setIncidents] = useState<AdminIncident[]>([]);

  const refresh = useCallback(async () => {
    const response = await fetch('/api/admin/incidents');
    if (!response.ok) return;
    const data = (await response.json()) as { incidents: AdminIncident[] };
    setIncidents(data.incidents);
  }, []);

  useEffect(() => {
    if (signedIn) void refresh();
  }, [signedIn, refresh]);

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
    window.location.reload();
  }

  async function logout() {
    await fetch('/api/admin/logout', {
      method: 'POST',
      headers: { 'x-csrf-token': getCsrfToken() },
    });
    window.location.reload();
  }

  async function create(form: FormData) {
    setMessage('');
    let reportingArea: unknown;
    const rawArea = String(form.get('reportingArea') ?? '').trim();
    if (rawArea) {
      try {
        reportingArea = JSON.parse(rawArea);
      } catch {
        setMessage('Reporting area must be valid GeoJSON');
        return;
      }
    }
    const response = await adminApi('/api/admin/incidents', {
      title: form.get('title'),
      description: String(form.get('description') ?? '') || undefined,
      templateKey: form.get('templateKey'),
      center: {
        latitude: Number(form.get('latitude')),
        longitude: Number(form.get('longitude')),
        zoom: Number(form.get('zoom')),
      },
      reportingArea,
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
    void refresh();
  }

  async function act(incidentId: string, action: 'publish' | 'close') {
    setMessage('');
    const response = await adminApi(`/api/admin/incidents/${incidentId}/${action}`, {});
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      setMessage(data.error ?? `Could not ${action} incident`);
      return;
    }
    void refresh();
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
          <a className="button button-secondary button-sm" href="/admin/moderation">
            Moderation queue
          </a>
          <button type="button" className="button button-secondary button-sm" onClick={logout}>
            Sign out
          </button>
        </div>
      </div>

      {message && <p className="notice">{message}</p>}

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
            <select name="templateKey" defaultValue="storm-damage">
              <option value="storm-damage">Storm Damage</option>
              <option value="cellular-outage">Cellular Outage</option>
            </select>
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.6rem' }}>
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
            Reporting area GeoJSON (optional)
            <span className="hint">
              Paste a Polygon or MultiPolygon. A visual drawing editor is planned.
            </span>
            <textarea name="reportingArea" placeholder='{"type":"Polygon","coordinates":[...]}' />
          </label>
          <button className="button">Create draft</button>
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
