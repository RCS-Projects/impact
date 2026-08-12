import { notFound } from 'next/navigation';
import { findPublicIncident } from '@/lib/incidents';
import { ReportForm } from '@/components/report-form';
export const dynamic = 'force-dynamic';
export default async function ReportPage({ params }: { params: { reference: string } }) {
  const incident = await findPublicIncident(params.reference);
  if (!incident || incident.status !== 'live') notFound();
  return (
    <main className="shell">
      <p className="eyebrow">SUBMIT A REPORT</p>
      <h1>{incident.title}</h1>
      <p>Reports are crowdsourced and may not be independently verified.</p>
      <ReportForm
        reference={params.reference}
        schema={incident.formSchema as { fields: never[] }}
        center={[incident.initialLongitude, incident.initialLatitude]}
      />
    </main>
  );
}
