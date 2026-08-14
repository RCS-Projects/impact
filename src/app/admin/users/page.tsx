import type { Metadata } from 'next';
import { UserManagement } from '@/components/admin/user-management';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Users . Impact',
};

export default function UsersPage() {
  return <UserManagement />;
}
