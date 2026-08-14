import Link from 'next/link';
import { listPublicAll } from '@/server/services/incidents.service';

export const dynamic = 'force-dynamic';

export default async function LandingPage() {
  const incidents = await listPublicAll();
  const liveIncidents = incidents.filter((i) => i.status === 'live');
  const closedIncidents = incidents.filter((i) => i.status === 'closed');

  return (
    <main className="shell">
      <p className="eyebrow">Community incident maps</p>
      <h1 className="page-title">See what&apos;s happening. Share what you know.</h1>
      <p>
        Impact Maps are crowdsourced community maps for storms, outages, road conditions, and other
        local incidents. No account needed — open a map, drop a pin, and tell us what you are
        experiencing. Your location can stay private.
      </p>
      <p className="disclaimer">
        Reports are crowdsourced and may not be independently verified. This is not an official
        emergency alerting system.
      </p>

      <h2 style={{ marginTop: '2rem', marginBottom: '0.75rem' }}>Live maps</h2>
      {liveIncidents.length === 0 && <p className="hint">No live incident maps right now.</p>}
      {liveIncidents.map((incident) => (
        <Link
          key={incident.reference}
          className="incident-card"
          href={`/map/${incident.reference}`}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0 }}>{incident.title}</h2>
            <span className="chip chip-live">live</span>
            <span className="hint" style={{ fontSize: '0.82rem' }}>
              {incident.reportCount} report{incident.reportCount !== 1 ? 's' : ''}
            </span>
          </div>
          {incident.description && <p>{incident.description}</p>}
        </Link>
      ))}

      {closedIncidents.length > 0 && (
        <>
          <h2 style={{ marginTop: '2rem', marginBottom: '0.75rem' }}>Past incidents</h2>
          {closedIncidents.map((incident) => (
            <Link
              key={incident.reference}
              className="incident-card"
              href={`/map/${incident.reference}`}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0 }}>{incident.title}</h2>
                <span className="chip chip-closed">closed</span>
                <span className="hint" style={{ fontSize: '0.82rem' }}>
                  {incident.reportCount} report{incident.reportCount !== 1 ? 's' : ''}
                </span>
              </div>
              {incident.description && <p>{incident.description}</p>}
            </Link>
          ))}
        </>
      )}

      <div className="buttons">
        <Link className="button button-secondary" href="/admin">
          Administration
        </Link>
      </div>
    </main>
  );
}
