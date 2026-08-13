import type { Metadata } from 'next';
import { TemplateList } from '@/components/admin/template-list';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Templates . Impact',
};

export default function TemplatesPage() {
  return <TemplateList />;
}
