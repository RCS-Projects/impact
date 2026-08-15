import type { Metadata } from 'next';
import { ReportEditPage } from '@/components/report/report-edit-page';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Update your report' };

export default async function ReportEditRoute({
  params,
}: {
  params: Promise<{ id: string; token: string }>;
}) {
  const { id, token } = await params;
  return <ReportEditPage reportId={id} token={token} />;
}
