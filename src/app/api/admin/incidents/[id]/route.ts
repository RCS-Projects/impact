import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApi } from '@/server/errors';
import { noStore } from '@/server/http';
import { requireAdmin, requireAdminRole } from '@/server/services/auth.service';
import { getById, update } from '@/server/services/incidents.service';
import { incidentFormSchema } from '@/server/schema/form-schema';

export const dynamic = 'force-dynamic';

const choiceSchema = z.object({
  value: z.string().min(1).max(80),
  label: z.string().min(1).max(160),
});

const formFieldInput = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
  type: z.enum([
    'short_text', 'long_text', 'single_select', 'multi_select',
    'radio', 'checkbox', 'boolean', 'datetime', 'info',
  ]),
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

const updateInput = z.object({
  title: z.string().min(3).max(160).optional(),
  description: z.string().max(4000).optional(),
  center: z
    .object({
      latitude: z.number().min(41).max(84),
      longitude: z.number().min(-142).max(-52),
    })
    .optional(),
  zoom: z.number().min(3).max(18).optional(),
  reportingArea: z.unknown().optional(),
  displaySettings: z.unknown().optional(),
  reportExpiryDays: z.number().int().min(1).max(365).nullish(),
  formSchema: z
    .object({
      version: z.literal(1),
      fields: z.array(formFieldInput).min(1).max(50),
    })
    .optional(),
});

export const GET = handleApi(
  async (_request: NextRequest, { params }: { params: { id: string } }) => {
    await requireAdmin();
    const incident = await getById(params.id);
    return NextResponse.json({ incident }, { headers: noStore() });
  },
);

export const PATCH = handleApi(
  async (request: NextRequest, { params }: { params: { id: string } }) => {
    const admin = await requireAdminRole(request);
    const raw = await request.json().catch(() => null);
    const data = updateInput.parse(raw);
    if (data.formSchema) {
      const parsed = incidentFormSchema.parse(data.formSchema);
      data.formSchema = parsed;
    }
    const result = await update(params.id, data, admin);
    return NextResponse.json(result, { headers: noStore() });
  },
);
