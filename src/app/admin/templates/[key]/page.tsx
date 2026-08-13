import type { Metadata } from 'next';
import { TemplateEditor } from '@/components/admin/template-editor';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Edit template . Impact',
};

export default async function TemplateEditorPage({ params }: { params: { key: string } }) {
  return <TemplateEditor templateKey={params.key} />;
}
