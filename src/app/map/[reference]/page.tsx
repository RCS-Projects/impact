import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { FieldView } from '@/shared/types';
import { IncidentMapView } from '@/components/map/incident-map-view';
import { deriveFilters, incidentFormSchema, primaryColorField } from '@/server/schema/form-schema';
import { getPublicIncident } from '@/server/services/incidents.service';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { reference: string };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const incident = await getPublicIncident(params.reference);
  return { title: incident?.title ?? 'Incident map' };
}

export default async function IncidentMapPage({ params }: PageProps) {
  const incident = await getPublicIncident(params.reference);
  if (!incident) notFound();
  const schema = incidentFormSchema.parse(incident.formSchema);
  const filters = deriveFilters(schema);
  const colorField = primaryColorField(schema);

  return (
    <IncidentMapView
      reference={params.reference}
      title={incident.title}
      description={incident.description}
      incidentStatus={incident.status === 'live' ? 'live' : 'closed'}
      center={[incident.longitude, incident.latitude]}
      zoom={incident.zoom}
      reportingArea={incident.reportingArea}
      fields={schema.fields as FieldView[]}
      filters={filters}
      colorFieldKey={colorField?.key ?? null}
      displaySettings={(incident.displaySettings as Record<string, unknown>) ?? {}}
    />
  );
}
