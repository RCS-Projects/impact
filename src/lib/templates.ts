import type { IncidentFormSchema } from './form-schema';

type Template = { key: string; title: string; description: string; schema: IncidentFormSchema };
const choices = (values: string[]) => values.map((value) => ({ value, label: value }));

export const stormDamageTemplate: Template = {
  key: 'storm-damage',
  title: 'Storm Damage',
  description: 'Report weather-related impacts in your community.',
  schema: {
    version: 1,
    fields: [
      {
        key: 'damage_type',
        type: 'single_select',
        label: 'Damage type',
        required: true,
        order: 1,
        choices: choices([
          'tree_down',
          'flooding',
          'hail',
          'power_lines_wires',
          'structural_damage',
          'road_blocked',
          'other',
        ]),
      },
      {
        key: 'severity',
        type: 'radio',
        label: 'Severity',
        required: true,
        order: 2,
        choices: choices(['minor', 'moderate', 'major']),
      },
      {
        key: 'description',
        type: 'long_text',
        label: 'Description',
        required: false,
        order: 3,
        constraints: { maxLength: 2000 },
      },
      { key: 'observed_at', type: 'datetime', label: 'Time observed', required: true, order: 4 },
    ],
  },
};

export const cellularOutageTemplate: Template = {
  key: 'cellular-outage',
  title: 'Cellular Outage',
  description: 'Report cellular service conditions in your area.',
  schema: {
    version: 1,
    fields: [
      {
        key: 'provider',
        type: 'single_select',
        label: 'Provider',
        required: true,
        order: 1,
        choices: choices([
          'Bell',
          'Rogers',
          'Telus',
          'Freedom Mobile',
          'Eastlink',
          'Videotron',
          'Public Mobile',
          'Fido',
          'Koodo',
          'Virgin Plus',
          'Chatr',
          'Lucky Mobile',
          'other',
        ]),
      },
      {
        key: 'overall_status',
        type: 'radio',
        label: 'Overall status',
        required: true,
        order: 2,
        choices: choices(['down', 'intermittent', 'degraded', 'restored']),
      },
      {
        key: 'affected_services',
        type: 'multi_select',
        label: 'Affected services',
        required: true,
        order: 3,
        choices: choices(['calls', 'SMS_text', 'mobile_data', 'emergency_calling', 'other']),
      },
      {
        key: 'approximate_start_time',
        type: 'datetime',
        label: 'Approximate start time',
        required: false,
        order: 4,
      },
      {
        key: 'description',
        type: 'long_text',
        label: 'Description',
        required: false,
        order: 5,
        constraints: { maxLength: 2000 },
      },
    ],
  },
};
