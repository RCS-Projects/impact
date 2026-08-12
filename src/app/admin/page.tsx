import { AdminDashboard } from '@/components/admin-dashboard';
import { currentAdmin } from '@/lib/auth';
export const dynamic = 'force-dynamic';
export default async function AdminPage() {
  return <AdminDashboard signedIn={Boolean(await currentAdmin())} />;
}
