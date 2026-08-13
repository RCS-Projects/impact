import type { Metadata } from 'next';
import { AdminApp } from '@/components/admin/admin-app';
import { currentAdmin } from '@/server/services/auth.service';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Administration' };

export default async function AdminPage() {
  const admin = await currentAdmin();
  return <AdminApp signedIn={Boolean(admin)} />;
}
