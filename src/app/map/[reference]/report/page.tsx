import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { FieldView } from '@/shared/types';
import { ReportForm } from '@/components/report/report-form';
import { getEnv } from '@/server/env';
import { incidentFormSchema } from '@/server/schema/form-schema';
import { getPublicIncident } from '@/server/services/incidents.service';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { reference: string };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const incident = await getPublicIncident(params.reference);
  return { title: incident ? `Report — ${incident.title}` : 'Submit a report' };
}

export default async function ReportPage({ params }: PageProps) {
  const incident = await getPublicIncident(params.reference);
  if (!incident) notFound();
  const schema = incidentFormSchema.parse(incident.formSchema);
  const env = getEnv();

  return (
    <main className="shell">
      <p className="eyebrow">Crowdsourced report</p>
      <h1 className="page-title">{incident.title}</h1>
      {incident.status !== 'live' ? (
        <p className="notice notice-warn">
          This incident is closed and is no longer accepting reports.{' '}
          <a href={`/map/${params.reference}`}>View the map</a>
        </p>
      ) : (
        <>
          <p className="disclaimer">
            Reports are crowdsourced and may not be independently verified. One report per person,
            please — you will get a private link to update it as things change.
          </p>
          <div className="forms-grid" style={{ marginTop: '1.25rem' }}>
            <ReportForm
              reference={params.reference}
              fields={schema.fields as FieldView[]}
              center={[incident.longitude, incident.latitude]}
              reportingArea={incident.reportingArea}
              turnstileSiteKey={env.TURNSTILE_SITE_KEY || null}
              mode="create"
              geometryMode={incident.reportGeometryMode}
            />
          </div>
        </>
      )}
    </main>
  );
}
