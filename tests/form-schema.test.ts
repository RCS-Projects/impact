import { describe, expect, it } from 'vitest';
import {
  deriveFilters,
  incidentFormSchema,
  primaryColorField,
  validateAnswers,
  type IncidentFormSchema,
} from '@/server/schema/form-schema';
import { AppError } from '@/server/errors';

const schema: IncidentFormSchema = {
  version: 1,
  fields: [
    {
      key: 'damage_type',
      type: 'single_select',
      label: 'Damage type',
      required: true,
      order: 1,
      choices: [
        { value: 'tree_down', label: 'Tree down' },
        { value: 'flooding', label: 'Flooding' },
      ],
    },
    {
      key: 'severity',
      type: 'radio',
      label: 'Severity',
      required: true,
      order: 2,
      choices: [
        { value: 'minor', label: 'Minor' },
        { value: 'major', label: 'Major' },
      ],
    },
    {
      key: 'services',
      type: 'multi_select',
      label: 'Affected services',
      required: false,
      order: 3,
      choices: [
        { value: 'calls', label: 'Calls' },
        { value: 'data', label: 'Data' },
      ],
    },
    {
      key: 'description',
      type: 'long_text',
      label: 'Description',
      required: false,
      order: 4,
      constraints: { maxLength: 50 },
    },
    { key: 'confirmed', type: 'boolean', label: 'Confirmed', required: false, order: 5 },
    { key: 'observed_at', type: 'datetime', label: 'Observed', required: false, order: 6 },
    { key: 'note', type: 'info', label: 'Informational text', required: false, order: 7 },
  ],
};

describe('incidentFormSchema', () => {
  it('accepts a valid schema', () => {
    expect(incidentFormSchema.parse(schema).fields).toHaveLength(7);
  });

  it('rejects duplicate field keys', () => {
    const broken = {
      ...schema,
      fields: [schema.fields[0], { ...schema.fields[1], key: 'damage_type' }],
    };
    expect(() => incidentFormSchema.parse(broken)).toThrow();
  });
});

describe('validateAnswers', () => {
  it('validates and normalizes correct answers', () => {
    const output = validateAnswers(schema, {
      damage_type: 'tree_down',
      severity: 'major',
      services: ['calls', 'data', 'calls'],
      description: '  Branches across the road  ',
      confirmed: true,
      observed_at: '2026-08-12T10:30:00',
    });
    expect(output.damage_type).toBe('tree_down');
    expect(output.services).toEqual(['calls', 'data']);
    expect(output.description).toBe('Branches across the road');
    expect(output.confirmed).toBe(true);
    expect(typeof output.observed_at).toBe('string');
  });

  it('rejects undeclared fields', () => {
    expect(() =>
      validateAnswers(schema, { damage_type: 'tree_down', severity: 'minor', evil: 'x' }),
    ).toThrowError(AppError);
  });

  it('rejects missing required fields', () => {
    expect(() => validateAnswers(schema, { severity: 'minor' })).toThrow(/required/);
  });

  it('rejects invalid choices', () => {
    expect(() => validateAnswers(schema, { damage_type: 'meteor', severity: 'minor' })).toThrow(
      /invalid choice/,
    );
  });

  it('rejects wrong types', () => {
    expect(() =>
      validateAnswers(schema, { damage_type: 'tree_down', severity: 'minor', confirmed: 'yes' }),
    ).toThrow(/yes or no/);
  });

  it('enforces length constraints', () => {
    expect(() =>
      validateAnswers(schema, {
        damage_type: 'tree_down',
        severity: 'minor',
        description: 'x'.repeat(51),
      }),
    ).toThrow(/length/);
  });

  it('ignores info fields even if supplied keys are rejected', () => {
    expect(() =>
      validateAnswers(schema, { damage_type: 'tree_down', severity: 'minor', note: 'x' }),
    ).toThrow(/Undeclared/);
  });

  it('dedupes multi_select values and caps length', () => {
    expect(() =>
      validateAnswers(schema, {
        damage_type: 'tree_down',
        severity: 'minor',
        services: Array.from({ length: 21 }, () => 'calls'),
      }),
    ).toThrow(/invalid choices/);
  });
});

describe('deriveFilters', () => {
  it('returns only choice fields, capped at three', () => {
    const filters = deriveFilters(schema);
    expect(filters.map((f) => f.key)).toEqual(['damage_type', 'severity', 'services']);
  });

  it('primaryColorField is the first filter', () => {
    expect(primaryColorField(schema)?.key).toBe('damage_type');
  });
});
