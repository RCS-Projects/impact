import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ModerationApp } from '@/components/admin/moderation-app';
import { currentAdmin } from '@/server/services/auth.service';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Moderation' };

export default async function ModerationPage() {
  const admin = await currentAdmin();
  if (!admin) redirect('/admin');
  return <ModerationApp />;
}
