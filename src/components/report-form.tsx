'use client';
import { useState } from 'react';
type Field = {
  key: string;
  type: string;
  label: string;
  required: boolean;
  choices?: { value: string; label: string }[];
};
export function ReportForm({
  reference,
  schema,
}: {
  reference: string;
  schema: { fields: Field[] };
}) {
  const [message, setMessage] = useState('');
  const [privacy, setPrivacy] = useState('approximate');
  async function submit(form: FormData) {
    const answers: Record<string, unknown> = {};
    schema.fields.forEach((f) => {
      if (f.type === 'info') return;
      const values = form.getAll(f.key);
      answers[f.key] =
        f.type === 'multi_select'
          ? values
          : f.type === 'boolean' || f.type === 'checkbox'
            ? form.get(f.key) === 'true'
            : form.get(f.key);
    });
    const response = await fetch(`/api/incidents/${reference}/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        latitude: Number(form.get('latitude')),
        longitude: Number(form.get('longitude')),
        privacy,
        answers,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(data.error ?? 'Could not submit report');
      return;
    }
    setMessage(`Report saved. Keep this private edit link: ${location.origin}${data.editUrl}`);
  }
  return (
    <form action={submit}>
      <p>
        Address search is optional; enter a coordinate from the map or use your device location in
        the next update.
      </p>
      <label>
        Latitude
        <input name="latitude" type="number" step="any" min="41" max="84" required />
      </label>
      <label>
        Longitude
        <input name="longitude" type="number" step="any" min="-142" max="-52" required />
      </label>
      <fieldset>
        <legend>Public location</legend>
        <label>
          <input
            type="radio"
            checked={privacy === 'approximate'}
            onChange={() => setPrivacy('approximate')}
          />{' '}
          Approximate (recommended)
        </label>
        <label>
          <input type="radio" checked={privacy === 'exact'} onChange={() => setPrivacy('exact')} />{' '}
          Exact
        </label>
      </fieldset>
      {schema.fields
        .filter((f) => f.type !== 'info')
        .map((field) => (
          <label key={field.key}>
            {field.label}
            {field.type === 'long_text' ? (
              <textarea name={field.key} required={field.required} />
            ) : field.choices ? (
              <select
                name={field.key}
                required={field.required}
                multiple={field.type === 'multi_select'}
              >
                <option value="">Select…</option>
                {field.choices.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                name={field.key}
                type={field.type === 'datetime' ? 'datetime-local' : 'text'}
                required={field.required}
              />
            )}
          </label>
        ))}
      <button className="button">Submit report</button>
      <p>{message}</p>
    </form>
  );
}
