import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { FieldView } from '@/shared/types';
import { IncidentMapView } from '@/components/map/incident-map-view';
import { deriveFilters, incidentFormSchema, primaryColorField } from '@/server/schema/form-schema';
import { getPublicIncident } from '@/server/services/incidents.service';
import { parseDisplaySettings } from '@/server/schema/incident-schema';
import { getEnv } from '@/server/env';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { reference: string };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const incident = await getPublicIncident(params.reference);
  const url = `${getEnv().APP_URL}/map/${params.reference}`;
  const title = incident?.title ?? 'Incident map';
  const description = incident?.description ?? 'Crowdsourced community incident map.';
  return {
    title,
    description,
    metadataBase: new URL(getEnv().APP_URL),
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: 'Impact Maps',
      type: 'website',
      images: [{ url: '/favicon.svg', alt: 'Impact Maps' }],
    },
    twitter: { card: 'summary', title, description },
  };
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
      displaySettings={parseDisplaySettings(incident.displaySettings)}
    />
  );
}
