import type { IncidentFormSchema } from '../schema/form-schema';

export interface SeedTemplate {
  key: string;
  title: string;
  description: string;
  schema: IncidentFormSchema;
}

const choice = (value: string, label: string) => ({ value, label });

export const stormDamageTemplate: SeedTemplate = {
  key: 'storm-damage',
  title: 'Storm Damage',
  description: 'Report weather-related impacts in your community.',
  schema: {
    version: 1,
    fields: [
      {
        key: 'damage_type',
        type: 'single_select',
        label: 'What are you reporting?',
        required: true,
        order: 1,
        choices: [
          choice('tree_down', 'Tree down'),
          choice('wires_down', 'Wires down'),
          choice('flooding', 'Flooding'),
          choice('hail', 'Hail damage'),
          choice('structural_damage', 'Structural damage'),
          choice('road_blocked', 'Road blocked'),
          choice('power_outage', 'Power outage'),
          choice('other', 'Other damage'),
        ],
      },
      {
        key: 'severity',
        type: 'radio',
        label: 'Severity',
        required: true,
        order: 2,
        choices: [
          choice('minor', 'Minor'),
          choice('moderate', 'Moderate'),
          choice('major', 'Major'),
        ],
      },
      {
        key: 'description',
        type: 'long_text',
        label: 'Description',
        helpText: 'What do you see? Avoid sharing personal details.',
        required: false,
        order: 3,
        constraints: { maxLength: 2000 },
      },
      {
        key: 'observed_at',
        type: 'datetime',
        label: 'When did you observe this?',
        required: true,
        order: 4,
      },
    ],
  },
};

export const cellularOutageTemplate: SeedTemplate = {
  key: 'cellular-outage',
  title: 'Cellular Outage',
  description: 'Report cellular service conditions in your area.',
  schema: {
    version: 1,
    fields: [
      {
        key: 'provider',
        type: 'single_select',
        label: 'Cellular provider',
        required: true,
        order: 1,
        choices: [
          choice('bell', 'Bell'),
          choice('rogers', 'Rogers'),
          choice('telus', 'Telus'),
          choice('freedom', 'Freedom Mobile'),
          choice('eastlink', 'Eastlink'),
          choice('videotron', 'Videotron'),
          choice('public_mobile', 'Public Mobile'),
          choice('fido', 'Fido'),
          choice('koodo', 'Koodo'),
          choice('virgin_plus', 'Virgin Plus'),
          choice('chatr', 'Chatr'),
          choice('lucky_mobile', 'Lucky Mobile'),
          choice('other', 'Other'),
        ],
      },
      {
        key: 'overall_status',
        type: 'radio',
        label: 'Service status',
        required: true,
        order: 2,
        choices: [
          choice('down', 'Completely down'),
          choice('intermittent', 'Intermittent'),
          choice('degraded', 'Degraded'),
          choice('restored', 'Restored'),
        ],
      },
      {
        key: 'affected_services',
        type: 'multi_select',
        label: 'What is affected?',
        required: true,
        order: 3,
        choices: [
          choice('calls', 'Calls'),
          choice('text_messages', 'Text messages'),
          choice('mobile_data', 'Mobile data'),
          choice('emergency_calling', 'Emergency calling'),
        ],
      },
      {
        key: 'started_at',
        type: 'datetime',
        label: 'Approximate start time',
        required: false,
        order: 4,
      },
      {
        key: 'description',
        type: 'long_text',
        label: 'Details',
        helpText: 'Anything else that might help (device behaviour, error messages).',
        required: false,
        order: 5,
        constraints: { maxLength: 2000 },
      },
    ],
  },
};

export const seedTemplates = [stormDamageTemplate, cellularOutageTemplate];
