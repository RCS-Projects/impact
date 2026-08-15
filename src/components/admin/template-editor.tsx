'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getCsrfToken } from '@/lib/csrf';
import { FormBuilder } from '@/components/admin/form-builder';
import type { FormField } from '@/server/schema/form-schema';

interface TemplateData {
  id: string;
  key: string;
  title: string;
  description: string | null;
  schema: { version: 1; fields: FormField[] };
}

export function TemplateEditor({ templateKey }: { templateKey: string }) {
  const router = useRouter();
  const [template, setTemplate] = useState<TemplateData | null>(null);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/templates/${templateKey}`);
    if (!res.ok) {
      setMessage('Failed to load template');
      return;
    }
    const data = (await res.json()) as { template: TemplateData };
    setTemplate(data.template);
  }, [templateKey]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!template || !dirty) return;
    setSaving(true);
    setMessage('');
    const res = await fetch(`/api/admin/templates/${templateKey}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
      body: JSON.stringify({
        title: template.title,
        description: template.description,
        schema: template.schema,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setMessage(data.error ?? 'Could not save');
      return;
    }
    setDirty(false);
    setMessage('Saved');
    void load();
  }

  if (!template) {
    return (
      <main className="shell">
        <p className="hint">Loading template...</p>
      </main>
    );
  }

  return (
    <main className="shell">
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <p className="eyebrow">
            <Link href="/admin/templates" style={{ color: 'inherit' }}>
              Templates
            </Link>{' '}
            / {template.key}
          </p>
          <h1 className="page-title">{template.title}</h1>
        </div>
        <div className="buttons" style={{ marginTop: 0 }}>
          <button
            type="button"
            className="button button-secondary button-sm"
            onClick={() => router.push('/admin/templates')}
          >
            Back
          </button>
        </div>
      </div>

      {message && <p className="notice">{message}</p>}

      <section className="card">
        <h2>Details</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <label className="field">
            Key
            <input value={template.key} disabled style={{ opacity: 0.6 }} />
          </label>
          <label className="field">
            Title
            <input
              value={template.title}
              onChange={(e) => {
                setTemplate({ ...template, title: e.target.value });
                setDirty(true);
              }}
              maxLength={160}
            />
          </label>
          <label className="field">
            Description
            <textarea
              value={template.description ?? ''}
              onChange={(e) => {
                setTemplate({ ...template, description: e.target.value || null });
                setDirty(true);
              }}
              maxLength={4000}
              rows={2}
            />
          </label>
        </div>
      </section>

      <section className="card">
        <h2>Form fields</h2>
        <FormBuilder
          value={template.schema.fields}
          onChange={(fields) => {
            setTemplate({ ...template, schema: { ...template.schema, fields } });
            setDirty(true);
          }}
        />
      </section>

      <div style={{ position: 'sticky', bottom: 0, padding: '0.6rem 0', background: 'var(--bg)' }}>
        <button
          type="button"
          className="button"
          disabled={!dirty || saving}
          onClick={() => void save()}
        >
          {saving ? 'Saving...' : dirty ? 'Save changes' : 'No changes'}
        </button>
      </div>
    </main>
  );
}
