'use client';
import { useState } from 'react';
async function api(path: string, body: unknown) {
  const r = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error ?? 'Request failed');
  return d;
}
export function AdminDashboard({ signedIn }: { signedIn: boolean }) {
  const [message, setMessage] = useState('');
  const [incident, setIncident] = useState<{ id: string; url: string } | null>(null);
  async function login(form: FormData) {
    try {
      await api('/api/admin/login', { login: form.get('login'), password: form.get('password') });
      location.reload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not sign in');
    }
  }
  async function create(form: FormData) {
    try {
      const data = await api('/api/admin/incidents', {
        title: form.get('title'),
        description: form.get('description') || undefined,
        templateKey: form.get('templateKey'),
        center: {
          latitude: Number(form.get('latitude')),
          longitude: Number(form.get('longitude')),
          zoom: Number(form.get('zoom')),
        },
        reportingArea: form.get('reportingArea')
          ? JSON.parse(String(form.get('reportingArea')))
          : undefined,
      });
      setIncident(data);
      setMessage('Draft created.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not create incident');
    }
  }
  async function publish() {
    if (!incident) return;
    try {
      const data = await api(`/api/admin/incidents/${incident.id}/publish`, {});
      setIncident({ ...incident, url: data.url });
      setMessage('Published.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not publish incident');
    }
  }
  if (!signedIn)
    return (
      <main className="shell">
        <p className="eyebrow">ADMINISTRATION</p>
        <h1>Sign in</h1>
        <form action={login}>
          <label>
            Login
            <input name="login" autoComplete="username" required />
          </label>
          <label>
            Password
            <input name="password" type="password" required />
          </label>
          <button className="button">Sign in</button>
        </form>
        <p>{message}</p>
      </main>
    );
  return (
    <main className="shell">
      <p className="eyebrow">ADMINISTRATION</p>
      <h1>Create an incident map</h1>
      <form action={create}>
        <label>
          Title
          <input name="title" required maxLength={160} />
        </label>
        <label>
          Description
          <textarea name="description" maxLength={4000} />
        </label>
        <label>
          Template
          <select name="templateKey">
            <option value="storm-damage">Storm Damage</option>
            <option value="cellular-outage">Cellular Outage</option>
          </select>
        </label>
        <label>
          Latitude
          <input name="latitude" type="number" step="any" required defaultValue="45.4215" />
        </label>
        <label>
          Longitude
          <input name="longitude" type="number" step="any" required defaultValue="-75.6972" />
        </label>
        <label>
          Zoom
          <input name="zoom" type="number" min="4" max="18" required defaultValue="10" />
        </label>
        <label>
          Reporting area GeoJSON (optional)
          <textarea name="reportingArea" placeholder='{"type":"Polygon","coordinates":[...]}' />
        </label>
        <button className="button">Create draft</button>
      </form>
      <p>{message}</p>
      {incident && (
        <section>
          <p>
            <a href={incident.url} target="_blank">
              Preview permanent map URL
            </a>
          </p>
          <button className="button" onClick={publish}>
            Publish incident
          </button>
        </section>
      )}
    </main>
  );
}
