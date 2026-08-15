'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getCsrfToken } from '@/lib/csrf';
import { PolygonEditor } from '@/components/admin/polygon-editor';
import { FormBuilder } from '@/components/admin/form-builder';
import type { FormField } from '@/server/schema/form-schema';

interface IncidentData {
  id: string;
  publicId: string;
  slug: string;
  title: string;
  description: string | null;
  status: string;
  longitude: number;
  latitude: number;
  zoom: number;
  reportingArea: unknown | null;
  formSchema: unknown;
  displaySettings: unknown;
  reportExpiryDays: number | null;
  createdAt: string;
  publishedAt: string | null;
  closedAt: string | null;
  updatedAt: string;
}

async function adminApi(path: string, method: string, body?: unknown) {
  const opts: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': getCsrfToken(),
    },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  return fetch(path, opts);
}

export function IncidentEditor({ incidentId }: { incidentId: string }) {
  const router = useRouter();
  const [incident, setIncident] = useState<IncidentData | null>(null);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/incidents/${incidentId}`);
    if (!res.ok) {
      setMessage('Failed to load incident');
      return;
    }
    const data = (await res.json()) as { incident: IncidentData };
    setIncident(data.incident);
  }, [incidentId]);

  useEffect(() => {
    void load();
  }, [load]);

  function updateField<K extends keyof IncidentData>(key: K, value: IncidentData[K]) {
    if (!incident) return;
    setIncident({ ...incident, [key]: value });
    setDirty(true);
  }

  async function save() {
    if (!incident || !dirty) return;
    setSaving(true);
    setMessage('');
    const body = {
      title: incident.title,
      description: incident.description,
      center: { latitude: incident.latitude, longitude: incident.longitude },
      zoom: incident.zoom,
      reportingArea: incident.reportingArea,
      reportExpiryDays: incident.reportExpiryDays,
      formSchema: incident.formSchema,
      displaySettings: incident.displaySettings,
    };
    const res = await adminApi(`/api/admin/incidents/${incidentId}`, 'PATCH', body);
    const data = (await res.json().catch(() => ({}))) as { error?: string; changedFields?: string[] };
    setSaving(false);
    if (!res.ok) {
      setMessage(data.error ?? 'Could not save changes');
      return;
    }
    setDirty(false);
    setMessage(`Saved: ${data.changedFields?.join(', ') ?? 'changes applied'}`);
    void load();
  }

  async function act(action: 'publish' | 'close' | 'archive') {
    setMessage('');
    const res = await adminApi(`/api/admin/incidents/${incidentId}/${action}`, 'POST', {});
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setMessage(data.error ?? `Could not ${action} incident`);
      return;
    }
    void load();
  }

  async function downloadSensitive(format: 'csv' | 'json') {
    if (!window.confirm('Sensitive export includes exact submitted locations. Download only for secure handling?')) return;
    const response = await fetch(`/api/admin/incidents/${incidentId}/export?format=${format}&sensitive=true`, {
      headers: { 'x-sensitive-export-confirm': 'yes' },
    });
    if (!response.ok) {
      setMessage('Sensitive export failed');
      return;
    }
    const blob = await response.blob();
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = `${incidentId}-sensitive.${format}`;
    link.click();
    URL.revokeObjectURL(href);
  }

  if (!incident) {
    return <main className="shell"><p className="hint">Loading incident...</p></main>;
  }

  const publicUrl = `/map/${incident.slug}-${incident.publicId}`;
  const canPublish = incident.status === 'draft';
  const canClose = incident.status === 'live';
  const canArchive = incident.status === 'closed';

  return (
    <main className="shell">
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <p className="eyebrow">
            <a href="/admin" style={{ color: 'inherit' }}>Incidents</a>
            {' '}/ Edit
          </p>
          <h1 className="page-title">{incident.title}</h1>
        </div>
        <div className="buttons" style={{ marginTop: 0 }}>
          <span className={`chip chip-${incident.status}`}>{incident.status}</span>
          {incident.status !== 'draft' && (
            <a className="button button-secondary button-sm" href={publicUrl} target="_blank" rel="noreferrer">
              View public
            </a>
          )}
          {canPublish && (
            <button type="button" className="button button-sm" onClick={() => act('publish')}>
              Publish
            </button>
          )}
          {canClose && (
            <button type="button" className="button button-secondary button-sm" onClick={() => act('close')}>
              Close
            </button>
          )}
          {canArchive && (
            <button type="button" className="button button-secondary button-sm" onClick={() => act('archive')}>
              Archive
            </button>
          )}
          <button type="button" className="button button-secondary button-sm" onClick={() => router.push('/admin')}>
            Back
          </button>
        </div>
      </div>

      {message && <p className="notice">{message}</p>}

      <section className="card">
        <h2>Details</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <label className="field">
            Title
            <input
              value={incident.title}
              onChange={(e) => updateField('title', e.target.value)}
              maxLength={160}
              required
            />
          </label>
          <label className="field">
            Description
            <textarea
              value={incident.description ?? ''}
              onChange={(e) => updateField('description', e.target.value || null)}
              maxLength={4000}
              rows={3}
            />
          </label>
          <div className="grid-3">
            <label className="field">
              Latitude
              <input
                type="number"
                step="any"
                value={incident.latitude}
                onChange={(e) => updateField('latitude', Number(e.target.value))}
              />
            </label>
            <label className="field">
              Longitude
              <input
                type="number"
                step="any"
                value={incident.longitude}
                onChange={(e) => updateField('longitude', Number(e.target.value))}
              />
            </label>
            <label className="field">
              Zoom
              <input
                type="number"
                min={3}
                max={18}
                value={incident.zoom}
                onChange={(e) => updateField('zoom', Number(e.target.value))}
              />
            </label>
          </div>
          <label className="field">
            Report expiry (days)
            <input
              type="number"
              min={1}
              max={365}
              value={incident.reportExpiryDays ?? ''}
              onChange={(e) => updateField('reportExpiryDays', e.target.value ? Number(e.target.value) : null)}
              placeholder="No expiry"
            />
          </label>
          <label className="field">
            Reporting area
            <span className="hint">
              Draw the reporting boundary on the map, or paste GeoJSON below.
            </span>
            <PolygonEditor
              center={[incident.longitude, incident.latitude]}
              value={
                incident.reportingArea &&
                typeof incident.reportingArea === 'object' &&
                (incident.reportingArea as { type?: string }).type === 'Polygon'
                  ? ((incident.reportingArea as { coordinates: [number, number][] }).coordinates[0] as unknown as [number, number][])
                  : null
              }
              onChange={(coords) => {
                if (!coords || coords.length < 3) {
                  updateField('reportingArea', null);
                } else {
                  updateField('reportingArea', { type: 'Polygon', coordinates: [coords] });
                }
              }}
            />
            <textarea
              value={incident.reportingArea ? JSON.stringify(incident.reportingArea) : ''}
              onChange={(e) => {
                const raw = e.target.value.trim();
                if (!raw) {
                  updateField('reportingArea', null);
                  return;
                }
                try {
                  updateField('reportingArea', JSON.parse(raw));
                } catch {
                  // ignore invalid JSON while typing
                }
              }}
              rows={4}
              placeholder='{"type":"Polygon","coordinates":[[...]]}'
              style={{ marginTop: '0.3rem' }}
            />
          </label>
        </div>
      </section>

      <section className="card">
        <h2>Report form</h2>
        <p className="hint" style={{ marginBottom: '0.6rem' }}>
          Define what information reporters submit. At least one field is required.
        </p>
        <FormBuilder
          value={(incident.formSchema as { fields: FormField[] })?.fields ?? []}
          onChange={(fields) =>
            updateField('formSchema', { version: 1, fields })
          }
        />
      </section>

      <section className="card">
        <h2>Display settings</h2>
        <p className="hint" style={{ marginBottom: '0.6rem' }}>
          Configure how the map looks for this incident.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
          <label className="field">
            Marker radius (px)
            <input
              type="number"
              min={4}
              max={30}
              value={typeof (incident.displaySettings as Record<string, unknown>)?.pointRadius === 'number' ? (incident.displaySettings as Record<string, unknown>).pointRadius as number : 10}
              onChange={(e) => {
                const ds = { ...((incident.displaySettings ?? {}) as Record<string, unknown>), pointRadius: Number(e.target.value) || 10 };
                updateField('displaySettings', ds);
              }}
            />
          </label>
          <label className="field">
            Cluster radius (px)
            <input
              type="number"
              min={20}
              max={100}
              value={typeof (incident.displaySettings as Record<string, unknown>)?.clusterRadius === 'number' ? (incident.displaySettings as Record<string, unknown>).clusterRadius as number : 45}
              onChange={(e) => {
                const ds = { ...((incident.displaySettings ?? {}) as Record<string, unknown>), clusterRadius: Number(e.target.value) || 45 };
                updateField('displaySettings', ds);
              }}
            />
          </label>
          <label className="field">
            Max cluster zoom
            <input
              type="number"
              min={8}
              max={18}
              value={typeof (incident.displaySettings as Record<string, unknown>)?.clusterMaxZoom === 'number' ? (incident.displaySettings as Record<string, unknown>).clusterMaxZoom as number : 14}
              onChange={(e) => {
                const ds = { ...((incident.displaySettings ?? {}) as Record<string, unknown>), clusterMaxZoom: Number(e.target.value) || 14 };
                updateField('displaySettings', ds);
              }}
            />
          </label>
          <label className="field">
            <span>&nbsp;</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.4rem' }}>
              <input
                type="checkbox"
                checked={(incident.displaySettings as Record<string, unknown>)?.showDescription !== false}
                onChange={(e) => {
                  const ds = { ...((incident.displaySettings ?? {}) as Record<string, unknown>), showDescription: e.target.checked };
                  updateField('displaySettings', ds);
                }}
              />
              Show description on map
            </label>
          </label>
        </div>
      </section>

      <section className="card">
        <h2>Meta</h2>
        <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.3rem 1rem', fontSize: '0.85rem' }}>
          <dt className="hint">ID</dt>
          <dd style={{ fontFamily: 'monospace' }}>{incident.id}</dd>
          <dt className="hint">Created</dt>
          <dd>{new Date(incident.createdAt).toLocaleString()}</dd>
          {incident.publishedAt && <>
            <dt className="hint">Published</dt>
            <dd>{new Date(incident.publishedAt).toLocaleString()}</dd>
          </>}
          {incident.closedAt && <>
            <dt className="hint">Closed</dt>
            <dd>{new Date(incident.closedAt).toLocaleString()}</dd>
          </>}
          <dt className="hint">Last updated</dt>
          <dd>{new Date(incident.updatedAt).toLocaleString()}</dd>
          <dt className="hint">Export</dt>
          <dd>
            <div className="buttons" style={{ marginTop: 0 }}>
              <a
                className="button button-secondary button-sm"
                href={`/api/admin/incidents/${incidentId}/export?format=csv`}
                target="_blank"
                rel="noreferrer"
              >
                CSV
              </a>
              <a
                className="button button-secondary button-sm"
                href={`/api/admin/incidents/${incidentId}/export?format=json`}
                target="_blank"
                rel="noreferrer"
              >
                JSON
              </a>
            </div>
          </dd>
          <dt className="hint">Sensitive export</dt>
          <dd>
            <p className="hint">Includes exact submitted locations. Every download is audited.</p>
            <div className="buttons" style={{ marginTop: 0 }}>
              <button type="button" className="button button-danger button-sm" onClick={() => void downloadSensitive('csv')}>Sensitive CSV</button>
              <button type="button" className="button button-danger button-sm" onClick={() => void downloadSensitive('json')}>Sensitive JSON</button>
            </div>
          </dd>
          <dt className="hint">Public URL</dt>
          <dd>
            {incident.status === 'draft' ? (
              <span className="hint">publish first</span>
            ) : (
              <a href={publicUrl} target="_blank" rel="noreferrer">{publicUrl}</a>
            )}
          </dd>
        </dl>
      </section>

      <div style={{ position: 'sticky', bottom: 0, padding: '0.6rem 0', background: 'var(--bg)' }}>
        <button
          type="button"
          className="button"
          disabled={!dirty || saving}
          onClick={() => void save()}
        >
          {saving ? 'Saving...' : dirty ? 'Save changes' : 'No changes'}
        </button>
      </div>
    </main>
  );
}
