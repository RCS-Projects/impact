import { describe, expect, it } from 'vitest';
import { validateAnswers } from '../src/lib/form-schema';
import { stormDamageTemplate } from '../src/lib/templates';

describe('server-side form validation', () => {
  it('accepts declared, valid values', () => {
    expect(
      validateAnswers(stormDamageTemplate.schema, {
        damage_type: 'flooding',
        severity: 'major',
        description: 'Water across the road',
        observed_at: '2026-08-11T12:00:00.000Z',
      }),
    ).toMatchObject({ damage_type: 'flooding', severity: 'major' });
  });

  it('rejects undeclared and invalid values', () => {
    expect(() =>
      validateAnswers(stormDamageTemplate.schema, {
        damage_type: 'nope',
        severity: 'major',
        observed_at: '2026-08-11T12:00:00Z',
      }),
    ).toThrow();
    expect(() =>
      validateAnswers(stormDamageTemplate.schema, {
        damage_type: 'flooding',
        severity: 'major',
        observed_at: '2026-08-11T12:00:00Z',
        administrator: true,
      }),
    ).toThrow('Undeclared');
  });
});
