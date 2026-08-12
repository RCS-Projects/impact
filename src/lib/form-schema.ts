import { z } from 'zod';

export const fieldTypes = [
  'short_text',
  'long_text',
  'single_select',
  'multi_select',
  'radio',
  'checkbox',
  'boolean',
  'datetime',
  'info',
] as const;
export type FieldType = (typeof fieldTypes)[number];

export const formFieldSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
  type: z.enum(fieldTypes),
  label: z.string().min(1).max(160),
  helpText: z.string().max(500).optional(),
  required: z.boolean().default(false),
  order: z.number().int().min(0),
  choices: z
    .array(z.object({ value: z.string().min(1).max(80), label: z.string().min(1).max(160) }))
    .max(50)
    .optional(),
  constraints: z
    .object({
      minLength: z.number().int().min(0).max(10000).optional(),
      maxLength: z.number().int().min(1).max(10000).optional(),
    })
    .optional(),
});
export const incidentFormSchema = z.object({
  version: z.literal(1),
  fields: z.array(formFieldSchema).min(1).max(50),
});
export type IncidentFormSchema = z.infer<typeof incidentFormSchema>;

export function validateAnswers(
  schema: IncidentFormSchema,
  value: unknown,
): Record<string, unknown> {
  const input = z.record(z.unknown()).parse(value);
  const fields = schema.fields.filter((field) => field.type !== 'info');
  const keys = new Set(fields.map((field) => field.key));
  for (const key of Object.keys(input))
    if (!keys.has(key)) throw new Error(`Undeclared field: ${key}`);
  const output: Record<string, unknown> = {};
  for (const field of fields) {
    const answer = input[field.key];
    if (answer === undefined || answer === null || answer === '') {
      if (field.required) throw new Error(`${field.label} is required`);
      continue;
    }
    if (field.type === 'short_text' || field.type === 'long_text') {
      if (typeof answer !== 'string') throw new Error(`${field.label} must be text`);
      const maximum = field.constraints?.maxLength ?? (field.type === 'short_text' ? 300 : 5000);
      if (answer.length > maximum || answer.length < (field.constraints?.minLength ?? 0))
        throw new Error(`${field.label} has an invalid length`);
      output[field.key] = answer.trim();
    } else if (field.type === 'boolean' || field.type === 'checkbox') {
      if (typeof answer !== 'boolean') throw new Error(`${field.label} must be yes or no`);
      output[field.key] = answer;
    } else if (field.type === 'datetime') {
      if (typeof answer !== 'string' || Number.isNaN(Date.parse(answer)))
        throw new Error(`${field.label} must be a date and time`);
      output[field.key] = new Date(answer).toISOString();
    } else if (field.type === 'single_select' || field.type === 'radio') {
      if (typeof answer !== 'string' || !field.choices?.some((choice) => choice.value === answer))
        throw new Error(`${field.label} has an invalid choice`);
      output[field.key] = answer;
    } else if (field.type === 'multi_select') {
      if (
        !Array.isArray(answer) ||
        answer.length > 20 ||
        !answer.every(
          (item) =>
            typeof item === 'string' && field.choices?.some((choice) => choice.value === item),
        )
      )
        throw new Error(`${field.label} has invalid choices`);
      output[field.key] = [...new Set(answer)];
    }
  }
  return output;
}
