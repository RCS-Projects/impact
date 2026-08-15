import type { Metadata } from 'next';
import { TemplateEditor } from '@/components/admin/template-editor';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Edit template . Impact',
};

export default async function TemplateEditorPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return <TemplateEditor templateKey={key} />;
}
