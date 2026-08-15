'use client';
import { useCallback, useEffect, useState } from 'react';
import { getCsrfToken } from '@/lib/csrf';

interface Template {
  id: string;
  key: string;
  title: string;
  description: string | null;
  schema: unknown;
}

export function TemplateList() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [message, setMessage] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newTitle, setNewTitle] = useState('');

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/templates');
    if (!res.ok) return;
    const data = (await res.json()) as { templates: Template[] };
    setTemplates(data.templates);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createTemplate() {
    setMessage('');
    if (!newKey || !newTitle) {
      setMessage('Key and title are required');
      return;
    }
    const res = await fetch('/api/admin/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
      body: JSON.stringify({
        key: newKey,
        title: newTitle,
        schema: {
          version: 1,
          fields: [
            {
              key: 'description',
              type: 'long_text',
              label: 'Description',
              required: false,
              order: 0,
            },
          ],
        },
      }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setMessage(data.error ?? 'Could not create template');
      return;
    }
    setMessage(`Template "${newKey}" created`);
    setNewKey('');
    setNewTitle('');
    setShowCreate(false);
    void load();
  }

  return (
    <main className="shell">
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <p className="eyebrow">
            <a href="/admin" style={{ color: 'inherit' }}>
              Admin
            </a>{' '}
            / Templates
          </p>
          <h1 className="page-title">Schema templates</h1>
        </div>
        <div className="buttons" style={{ marginTop: 0 }}>
          <button
            type="button"
            className="button button-sm"
            onClick={() => setShowCreate(!showCreate)}
          >
            {showCreate ? 'Cancel' : 'New template'}
          </button>
        </div>
      </div>

      {message && <p className="notice">{message}</p>}

      {showCreate && (
        <section className="card">
          <h2>Create template</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div className="grid-3">
              <label className="field">
                Key
                <input
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value.replace(/[^a-z0-9-]/g, ''))}
                  placeholder="storm-damage"
                  pattern="^[a-z][a-z0-9-]{0,79}$"
                  maxLength={80}
                />
              </label>
              <label className="field">
                Title
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  maxLength={160}
                  placeholder="Storm Damage"
                />
              </label>
            </div>
            <button
              type="button"
              className="button"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => void createTemplate()}
            >
              Create template
            </button>
          </div>
        </section>
      )}

      <section className="card">
        <h2>All templates</h2>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Key</th>
                <th>Title</th>
                <th>Fields</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => {
                const fieldCount = Array.isArray((t.schema as { fields?: unknown[] })?.fields)
                  ? (t.schema as { fields: unknown[] }).fields.length
                  : 0;
                return (
                  <tr key={t.key}>
                    <td style={{ fontFamily: 'monospace' }}>{t.key}</td>
                    <td>{t.title}</td>
                    <td>
                      {fieldCount} field{fieldCount !== 1 ? 's' : ''}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <a
                          className="button button-secondary button-sm"
                          href={`/admin/templates/${t.key}`}
                        >
                          Edit
                        </a>
                        <button
                          type="button"
                          className="button button-danger button-sm"
                          onClick={async () => {
                            if (!confirm(`Delete template "${t.title}"?`)) return;
                            const res = await fetch(`/api/admin/templates/${t.key}`, {
                              method: 'DELETE',
                              headers: { 'x-csrf-token': getCsrfToken() },
                            });
                            if (res.ok) {
                              setMessage(`Template "${t.key}" deleted`);
                              void load();
                            }
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {templates.length === 0 && (
                <tr>
                  <td colSpan={4} className="hint">
                    No templates yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
