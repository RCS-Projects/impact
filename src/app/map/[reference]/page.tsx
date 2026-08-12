import { notFound } from 'next/navigation';
import { findPublicIncident } from '@/lib/incidents';

export const dynamic = 'force-dynamic';
export default async function IncidentMapPage({ params }: { params: { reference: string } }) {
  const incident = await findPublicIncident(params.reference);
  if (!incident) notFound();
  const closed = incident.status === 'closed';
  return (
    <main className="shell">
      <p className="eyebrow">CROWDSOURCED INCIDENT MAP</p>
      <h1>{incident.title}</h1>
      {incident.description && <p>{incident.description}</p>}
      <p>
        <strong>
          {closed
            ? 'This incident is closed.'
            : 'Reports are crowdsourced and may not be independently verified.'}
        </strong>
      </p>
      {!closed && (
        <a className="button" href={`/map/${params.reference}/report`}>
          Submit a report
        </a>
      )}
      <p>
        Interactive map and accessible report list are being added in the current implementation
        milestone.
      </p>
    </main>
  );
}
