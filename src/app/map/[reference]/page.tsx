import { notFound } from 'next/navigation';
import { findPublicIncident } from '@/lib/incidents';
import { IncidentMap } from '@/components/incident-map';

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
      {Boolean(incident.reportingArea) && (
        <p>Reports are accepted only within the outlined area.</p>
      )}
      <IncidentMap
        reference={params.reference}
        center={[incident.initialLongitude, incident.initialLatitude]}
        zoom={incident.initialZoom}
        reportingArea={incident.reportingArea}
      />
      {!closed && (
        <a className="button" href={`/map/${params.reference}/report`}>
          Submit a report
        </a>
      )}
    </main>
  );
}
