import { z } from 'zod';
import type { FilterDefinition } from '@/shared/types';
import { AppError } from '../app-error';

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
  'photo',
] as const;
export type FieldType = (typeof fieldTypes)[number];

export const choiceSchema = z.object({
  value: z.string().min(1).max(80),
  label: z.string().min(1).max(160),
});

export const formFieldSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
  type: z.enum(fieldTypes),
  label: z.string().min(1).max(160),
  helpText: z.string().max(500).optional(),
  required: z.boolean().default(false),
  order: z.number().int().min(0),
  choices: z.array(choiceSchema).max(50).optional(),
  constraints: z
    .object({
      minLength: z.number().int().min(0).max(10000).optional(),
      maxLength: z.number().int().max(10000).min(1).optional(),
    })
    .optional(),
});

export const incidentFormSchema = z
  .object({
    version: z.literal(1),
    fields: z.array(formFieldSchema).min(1).max(50),
  })
  .refine(
    (schema) => new Set(schema.fields.map((field) => field.key)).size === schema.fields.length,
    { message: 'Field keys must be unique' },
  );

export type FormField = z.infer<typeof formFieldSchema>;
export type IncidentFormSchema = z.infer<typeof incidentFormSchema>;

function cleanText(value: string): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
}

export function validateAnswers(
  schema: IncidentFormSchema,
  value: unknown,
): Record<string, unknown> {
  const input = z.record(z.unknown()).parse(value);
  const fields = schema.fields.filter((field) => field.type !== 'info');
  const declared = new Set(fields.map((field) => field.key));
  for (const key of Object.keys(input))
    if (!declared.has(key)) throw AppError.badRequest(`Undeclared field: ${key}`);

  const output: Record<string, unknown> = {};
  for (const field of fields) {
    const answer = input[field.key];
    if (answer === undefined || answer === null || answer === '') {
      if (field.required) throw AppError.badRequest(`${field.label} is required`);
      continue;
    }
    switch (field.type) {
      case 'short_text':
      case 'long_text': {
        if (typeof answer !== 'string') throw AppError.badRequest(`${field.label} must be text`);
        const cleaned = cleanText(answer);
        const maximum = field.constraints?.maxLength ?? (field.type === 'short_text' ? 300 : 5000);
        const minimum = field.constraints?.minLength ?? 0;
        if (cleaned.length > maximum || cleaned.length < minimum)
          throw AppError.badRequest(`${field.label} has an invalid length`);
        output[field.key] = cleaned;
        break;
      }
      case 'boolean':
      case 'checkbox': {
        if (typeof answer !== 'boolean')
          throw AppError.badRequest(`${field.label} must be yes or no`);
        output[field.key] = answer;
        break;
      }
      case 'datetime': {
        if (typeof answer !== 'string' || Number.isNaN(Date.parse(answer)))
          throw AppError.badRequest(`${field.label} must be a date and time`);
        output[field.key] = new Date(answer).toISOString();
        break;
      }
      case 'single_select':
      case 'radio': {
        if (typeof answer !== 'string' || !field.choices?.some((choice) => choice.value === answer))
          throw AppError.badRequest(`${field.label} has an invalid choice`);
        output[field.key] = answer;
        break;
      }
      case 'multi_select': {
        if (
          !Array.isArray(answer) ||
          answer.length > 20 ||
          !answer.every(
            (item) =>
              typeof item === 'string' && field.choices?.some((choice) => choice.value === item),
          )
        )
          throw AppError.badRequest(`${field.label} has invalid choices`);
        output[field.key] = [...new Set(answer)];
        break;
      }
      case 'photo': {
        if (
          answer !== null &&
          answer !== undefined &&
          (typeof answer !== 'object' ||
            typeof (answer as Record<string, unknown>).uploadId !== 'string' ||
            !z
              .string()
              .uuid()
              .safeParse((answer as Record<string, unknown>).uploadId).success ||
            Object.keys(answer as Record<string, unknown>).some((key) => key !== 'uploadId'))
        ) {
          throw AppError.badRequest(`${field.label} must reference a valid photo upload`);
        }
        if (answer) output[field.key] = { uploadId: (answer as { uploadId: string }).uploadId };
        break;
      }
      default:
        break;
    }
  }
  return output;
}

export function deriveFilters(schema: IncidentFormSchema): FilterDefinition[] {
  const filters: FilterDefinition[] = [];
  for (const field of schema.fields) {
    if (
      (field.type === 'single_select' || field.type === 'radio' || field.type === 'multi_select') &&
      field.choices &&
      field.choices.length > 0
    ) {
      filters.push({
        key: field.key,
        label: field.label,
        type: field.type,
        choices: field.choices,
      });
    }
    if (filters.length >= 3) break;
  }
  return filters;
}

export function primaryColorField(schema: IncidentFormSchema): FilterDefinition | null {
  const filters = deriveFilters(schema);
  return filters[0] ?? null;
}
