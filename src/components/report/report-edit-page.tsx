'use client';
import { useEffect, useState } from 'react';
import type { FieldView } from '@/shared/types';
import { ReportForm, type EditInitialData } from './report-form';
import type { ReportGeometry } from '@/server/schema/report-geometry';

interface EditPayload {
  answers: Record<string, unknown>;
  privacy: 'exact' | 'approximate';
  latitude: number;
  longitude: number;
  placeLabel: string | null;
  schema: { fields: FieldView[] };
  incident: {
    title: string;
    status: string;
    reference: string;
    reportingArea: unknown | null;
    reportGeometryMode: 'point' | 'polygon' | 'point_or_polygon';
  };
  geometry?: ReportGeometry | null;
}

export function ReportEditPage({ reportId, token }: { reportId: string; token: string }) {
  const [payload, setPayload] = useState<EditPayload | null>(null);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    void (async () => {
      const response = await fetch(`/api/reports/${reportId}/edit/${token}`);
      if (!response.ok) {
        setError(
          response.status === 404
            ? 'This edit link is invalid or the report no longer exists.'
            : 'Could not load your report.',
        );
        return;
      }
      setPayload((await response.json()) as EditPayload);
    })();
  }, [reportId, token]);

  async function deleteReport() {
    if (!confirm('Delete this report? This cannot be undone.')) return;
    setDeleting(true);
    const response = await fetch(`/api/reports/${reportId}/edit/${token}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? 'Could not delete report');
      setDeleting(false);
      return;
    }
    setPayload(null);
    setError('');
    window.location.href = '/';
  }

  return (
    <main className="shell">
      <p className="eyebrow">Update your report</p>
      {error && <p className="notice notice-error">{error}</p>}
      {!error && !payload && <p className="hint">Loading your report…</p>}
      {payload && (
        <>
          <h1 className="page-title">{payload.incident.title}</h1>
          {payload.incident.status !== 'live' && (
            <p className="notice notice-warn">
              This incident is closed, so the report can no longer be updated.
            </p>
          )}
          {payload.incident.status === 'live' && (
            <ReportForm
              reference={payload.incident.reference}
              fields={payload.schema.fields}
              center={[payload.longitude, payload.latitude]}
              reportingArea={payload.incident.reportingArea}
              turnstileSiteKey={null}
              mode="edit"
              reportId={reportId}
              editToken={token}
              initial={{
                answers: payload.answers,
                privacy: payload.privacy,
                latitude: payload.latitude,
                longitude: payload.longitude,
                placeLabel: payload.placeLabel,
                geometry: payload.geometry,
              }}
              geometryMode={payload.incident.reportGeometryMode}
            />
          )}
          <div className="u-delete-panel">
            <button
              type="button"
              className="button button-sm u-muted-error"
              disabled={deleting}
              onClick={() => void deleteReport()}
            >
              {deleting ? 'Deleting...' : 'Delete this report'}
            </button>
            <span className="hint u-delete-note">This cannot be undone.</span>
          </div>
        </>
      )}
    </main>
  );
}
