import type { Metadata } from 'next';
import { ReportEditPage } from '@/components/report/report-edit-page';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Update your report' };

export default function ReportEditRoute({ params }: { params: { id: string; token: string } }) {
  return <ReportEditPage reportId={params.id} token={params.token} />;
}
