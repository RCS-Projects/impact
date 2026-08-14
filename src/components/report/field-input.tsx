'use client';
import type { FieldView } from '@/shared/types';
import { toLocalInputValue } from '@/lib/format';

export function FieldInput({ field, defaultValue }: { field: FieldView; defaultValue?: unknown }) {
  if (field.type === 'info') {
    return (
      <p className="hint">
        {field.label}
        {field.helpText ? ` — ${field.helpText}` : ''}
      </p>
    );
  }

  const hint = field.helpText ? <span className="hint">{field.helpText}</span> : null;

  switch (field.type) {
    case 'long_text':
      return (
        <label className="field" htmlFor={`f-${field.key}`}>
          {field.label}
          {field.required ? ' *' : ''}
          {hint}
          <textarea
            id={`f-${field.key}`}
            name={field.key}
            required={field.required}
            maxLength={field.constraints?.maxLength ?? 5000}
            defaultValue={typeof defaultValue === 'string' ? defaultValue : ''}
          />
        </label>
      );
    case 'short_text':
      return (
        <label className="field" htmlFor={`f-${field.key}`}>
          {field.label}
          {field.required ? ' *' : ''}
          {hint}
          <input
            id={`f-${field.key}`}
            name={field.key}
            type="text"
            required={field.required}
            maxLength={field.constraints?.maxLength ?? 300}
            defaultValue={typeof defaultValue === 'string' ? defaultValue : ''}
          />
        </label>
      );
    case 'single_select':
      return (
        <label className="field" htmlFor={`f-${field.key}`}>
          {field.label}
          {field.required ? ' *' : ''}
          {hint}
          <select
            id={`f-${field.key}`}
            name={field.key}
            required={field.required}
            defaultValue={typeof defaultValue === 'string' ? defaultValue : ''}
          >
            <option value="">Select…</option>
            {(field.choices ?? []).map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </select>
        </label>
      );
    case 'radio':
      return (
        <fieldset className="field">
          <legend>
            {field.label}
            {field.required ? ' *' : ''}
          </legend>
          {hint}
          <div className="choice-group">
            {(field.choices ?? []).map((choice) => (
              <label key={choice.value}>
                <input
                  type="radio"
                  name={field.key}
                  value={choice.value}
                  required={field.required}
                  defaultChecked={defaultValue === choice.value}
                />
                {choice.label}
              </label>
            ))}
          </div>
        </fieldset>
      );
    case 'multi_select': {
      const selected = Array.isArray(defaultValue) ? (defaultValue as string[]) : [];
      return (
        <fieldset className="field">
          <legend>
            {field.label}
            {field.required ? ' *' : ''}
          </legend>
          {hint}
          <div className="choice-group">
            {(field.choices ?? []).map((choice) => (
              <label key={choice.value}>
                <input
                  type="checkbox"
                  name={field.key}
                  value={choice.value}
                  defaultChecked={selected.includes(choice.value)}
                />
                {choice.label}
              </label>
            ))}
          </div>
        </fieldset>
      );
    }
    case 'checkbox':
      return (
        <label className="field">
          <span>
            {field.label}
            {field.required ? ' *' : ''}
          </span>
          {hint}
          <span className="choice-group">
            <label>
              <input type="checkbox" name={field.key} defaultChecked={defaultValue === true} />
              Yes
            </label>
          </span>
        </label>
      );
    case 'boolean':
      return (
        <fieldset className="field">
          <legend>
            {field.label}
            {field.required ? ' *' : ''}
          </legend>
          {hint}
          <div className="choice-group">
            <label>
              <input
                type="radio"
                name={field.key}
                value="true"
                required={field.required}
                defaultChecked={defaultValue === true}
              />
              Yes
            </label>
            <label>
              <input
                type="radio"
                name={field.key}
                value="false"
                defaultChecked={defaultValue === false}
              />
              No
            </label>
          </div>
        </fieldset>
      );
    case 'datetime':
      return (
        <label className="field" htmlFor={`f-${field.key}`}>
          {field.label}
          {field.required ? ' *' : ''}
          {hint}
          <input
            id={`f-${field.key}`}
            name={field.key}
            type="datetime-local"
            required={field.required}
            defaultValue={typeof defaultValue === 'string' ? toLocalInputValue(defaultValue) : ''}
          />
        </label>
      );
    case 'photo': {
      const existing = defaultValue as { uploadId?: string; url?: string } | null;
      return (
        <label className="field" htmlFor={`f-${field.key}`}>
          {field.label}
          {field.required ? ' *' : ''}
          {hint}
          {existing?.url && (
            <img
              src={existing.url}
              alt={field.label}
              style={{ maxWidth: 200, maxHeight: 200, borderRadius: 4, display: 'block', marginBottom: '0.3rem' }}
            />
          )}
          <input id={`f-${field.key}`} name={field.key} type="file" accept="image/jpeg,image/png,image/webp" />
        </label>
      );
    }
    default:
      return null;
  }
}

export function collectAnswers(fields: FieldView[], form: FormData): Record<string, unknown> {
  const answers: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.type === 'info') continue;
    if (field.type === 'photo') continue;
    switch (field.type) {
      case 'multi_select':
        answers[field.key] = form.getAll(field.key);
        break;
      case 'checkbox':
        answers[field.key] = form.get(field.key) === 'on';
        break;
      case 'boolean': {
        const value = form.get(field.key);
        if (value === 'true') answers[field.key] = true;
        else if (value === 'false') answers[field.key] = false;
        break;
      }
      default: {
        const value = form.get(field.key);
        if (typeof value === 'string' && value !== '') answers[field.key] = value;
        break;
      }
    }
  }
  return answers;
}

export function choiceLabel(fields: FieldView[], key: string, value: unknown): string {
  const field = fields.find((f) => f.key === key);
  if (field?.type === 'photo') {
    if (value && typeof value === 'object' && 'url' in value) return '[photo]';
    return String(value ?? '');
  }
  if (!field?.choices) return String(value);
  if (Array.isArray(value))
    return value
      .map((v) => field.choices?.find((c) => c.value === v)?.label ?? String(v))
      .join(', ');
  return field.choices.find((c) => c.value === value)?.label ?? String(value);
}
