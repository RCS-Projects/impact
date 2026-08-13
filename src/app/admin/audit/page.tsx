import type { Metadata } from 'next';
import { AuditViewer } from '@/components/admin/audit-viewer';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Audit log . Impact',
};

export default function AuditPage() {
  return <AuditViewer />;
}
