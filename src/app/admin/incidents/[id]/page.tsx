import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { SESSION_COOKIE, currentAdmin } from '@/server/services/auth.service';
import { IncidentEditor } from '@/components/admin/incident-editor';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Edit incident . Impact',
};

export default async function IncidentEditorPage({ params }: { params: { id: string } }) {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) {
    return (
      <main className="shell">
        <p className="notice notice-error">You must be signed in to access this page.</p>
      </main>
    );
  }

  const admin = await currentAdmin();
  if (!admin) {
    return (
      <main className="shell">
        <p className="notice notice-error">Your session has expired. Please sign in again.</p>
      </main>
    );
  }

  return <IncidentEditor incidentId={params.id} />;
}
