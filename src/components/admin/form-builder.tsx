'use client';
import { useState } from 'react';
import { fieldTypes, type FormField, type FieldType } from '@/server/schema/form-schema';

function tempKey() {
  return `field_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`;
}

function newField(order: number): FormField {
  return {
    key: tempKey(),
    type: 'short_text',
    label: '',
    required: false,
    order,
  };
}

const TYPE_LABELS: Record<FieldType, string> = {
  short_text: 'Short text',
  long_text: 'Long text',
  single_select: 'Single select',
  multi_select: 'Multi select',
  radio: 'Radio buttons',
  checkbox: 'Checkboxes',
  boolean: 'Yes / No',
  datetime: 'Date & time',
  info: 'Info text',
  photo: 'Photo upload',
};

export function FormBuilder({
  value,
  onChange,
  lockedKeys = new Set<string>(),
}: {
  value: FormField[];
  onChange: (fields: FormField[]) => void;
  lockedKeys?: Set<string>;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  function add() {
    const field = newField(value.length);
    onChange([...value, field]);
    setExpanded(field.key);
  }

  function remove(key: string) {
    onChange(value.filter((f) => f.key !== key).map((f, i) => ({ ...f, order: i })));
    if (expanded === key) setExpanded(null);
  }

  function update(key: string, patch: Partial<FormField>) {
    onChange(value.map((f) => (f.key === key ? { ...f, ...patch } : f)));
  }

  function moveUp(key: string) {
    const idx = value.findIndex((f) => f.key === key);
    if (idx <= 0) return;
    const next = [...value];
    [next[idx - 1], next[idx]] = [next[idx]!, next[idx - 1]!];
    onChange(next.map((f, i) => ({ ...f, order: i })));
  }

  function moveDown(key: string) {
    const idx = value.findIndex((f) => f.key === key);
    if (idx < 0 || idx >= value.length - 1) return;
    const next = [...value];
    [next[idx], next[idx + 1]] = [next[idx + 1]!, next[idx]!];
    onChange(next.map((f, i) => ({ ...f, order: i })));
  }

  const needsChoices = (t: FieldType) =>
    t === 'single_select' || t === 'multi_select' || t === 'radio' || t === 'checkbox';

  return (
    <div className="u-stack-sm">
      {value.map((field, idx) => (
        <div
          key={field.key}
          className="card u-form-card"
          onClick={() => setExpanded(expanded === field.key ? null : field.key)}
        >
          <div className="u-row-gap-sm">
            <span className="hint u-index-label">{idx + 1}.</span>
            <span className="u-flex-weight">
              {field.label || <span className="hint">Untitled field</span>}
            </span>
            <span className="chip u-chip-tiny">{TYPE_LABELS[field.type]}</span>
            {field.required && <span className="chip chip-flagged u-chip-tiny">required</span>}
            <div className="buttons u-buttons-compact">
              <button
                type="button"
                className="button button-secondary button-sm u-button-compact"
                onClick={(e) => {
                  e.stopPropagation();
                  moveUp(field.key);
                }}
                disabled={idx === 0}
              >
                &uarr;
              </button>
              <button
                type="button"
                className="button button-secondary button-sm u-button-compact"
                onClick={(e) => {
                  e.stopPropagation();
                  moveDown(field.key);
                }}
                disabled={idx === value.length - 1}
              >
                &darr;
              </button>
              <button
                type="button"
                className="button button-secondary button-sm u-danger-compact"
                onClick={(e) => {
                  e.stopPropagation();
                  remove(field.key);
                }}
              >
                &times;
              </button>
            </div>
          </div>

          {expanded === field.key && (
            <div className="u-field-stack" onClick={(e) => e.stopPropagation()}>
              <div className="grid-3">
                <label className="field">
                  Key
                  <input
                    value={field.key}
                    disabled={lockedKeys.has(field.key)}
                    onChange={(e) =>
                      update(field.key, { key: e.target.value.replace(/[^a-z0-9_]/g, '') })
                    }
                    pattern="^[a-z][a-z0-9_]{0,63}$"
                    maxLength={64}
                  />
                </label>
                <label className="field">
                  Label
                  <input
                    value={field.label}
                    onChange={(e) => update(field.key, { label: e.target.value })}
                    maxLength={160}
                  />
                </label>
                <label className="field">
                  Type
                  <select
                    value={field.type}
                    disabled={lockedKeys.has(field.key)}
                    onChange={(e) => {
                      const type = e.target.value as FieldType;
                      const patch: Partial<FormField> = { type };
                      if (needsChoices(type) && !field.choices) {
                        patch.choices = [{ value: 'option_1', label: 'Option 1' }];
                      }
                      if (!needsChoices(type)) patch.choices = undefined;
                      update(field.key, patch);
                    }}
                  >
                    {fieldTypes.map((t) => (
                      <option key={t} value={t}>
                        {TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="field">
                Help text
                <input
                  value={field.helpText ?? ''}
                  onChange={(e) => update(field.key, { helpText: e.target.value || undefined })}
                  maxLength={500}
                  placeholder="Optional helper text shown below the field"
                />
              </label>

              {field.type !== 'info' && (
                <label className="u-checkbox-label">
                  <input
                    type="checkbox"
                    checked={field.required}
                    onChange={(e) => update(field.key, { required: e.target.checked })}
                  />
                  Required
                </label>
              )}

              {needsChoices(field.type) && (
                <div>
                  <span className="hint u-label-small">Choices</span>
                  {(field.choices ?? []).map((choice, ci) => (
                    <div key={ci} className="u-inline-gap-sm">
                      <input
                        value={choice.value}
                        onChange={(e) => {
                          const choices = [...(field.choices ?? [])];
                          choices[ci] = { ...choice, value: e.target.value };
                          update(field.key, { choices });
                        }}
                        placeholder="value"
                        className="u-flex-1"
                      />
                      <input
                        value={choice.label}
                        onChange={(e) => {
                          const choices = [...(field.choices ?? [])];
                          choices[ci] = { ...choice, label: e.target.value };
                          update(field.key, { choices });
                        }}
                        placeholder="Label"
                        className="u-flex-two"
                      />
                      <button
                        type="button"
                        className="button button-secondary button-sm u-pad-compact"
                        onClick={() => {
                          const choices = (field.choices ?? []).filter((_, i) => i !== ci);
                          update(field.key, { choices });
                        }}
                      >
                        &times;
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="button button-secondary button-sm"
                    onClick={() => {
                      const choices = [
                        ...(field.choices ?? []),
                        {
                          value: `option_${(field.choices?.length ?? 0) + 1}`,
                          label: `Option ${(field.choices?.length ?? 0) + 1}`,
                        },
                      ];
                      update(field.key, { choices });
                    }}
                  >
                    + Add choice
                  </button>
                  {field.choices &&
                    field.choices.length > 1 &&
                    (() => {
                      const dupes = field.choices.filter(
                        (c, i, arr) => arr.findIndex((x) => x.value === c.value) !== i,
                      );
                      if (dupes.length === 0) return null;
                      return (
                        <p className="notice notice-warn u-mt-tiny">
                          Duplicate values: {dupes.map((d) => d.value).join(', ')}
                        </p>
                      );
                    })()}
                </div>
              )}

              {(field.type === 'short_text' || field.type === 'long_text') && (
                <div className="grid-3">
                  <label className="field">
                    Min length
                    <input
                      type="number"
                      min={0}
                      max={10000}
                      value={field.constraints?.minLength ?? ''}
                      onChange={(e) =>
                        update(field.key, {
                          constraints: {
                            ...field.constraints,
                            minLength: e.target.value ? Number(e.target.value) : undefined,
                            maxLength: field.constraints?.maxLength,
                          },
                        })
                      }
                    />
                  </label>
                  <label className="field">
                    Max length
                    <input
                      type="number"
                      min={1}
                      max={10000}
                      value={field.constraints?.maxLength ?? ''}
                      onChange={(e) =>
                        update(field.key, {
                          constraints: {
                            ...field.constraints,
                            maxLength: e.target.value ? Number(e.target.value) : undefined,
                            minLength: field.constraints?.minLength,
                          },
                        })
                      }
                    />
                  </label>
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      <button
        type="button"
        className="button button-secondary button-sm u-self-start"
        onClick={add}
      >
        + Add field
      </button>
    </div>
  );
}
