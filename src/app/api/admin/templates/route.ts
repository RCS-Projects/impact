import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApi } from '@/server/errors';
import { getSql } from '@/server/db/client';
import { noStore } from '@/server/http';
import { requireAdmin, requireAdminMutation } from '@/server/services/auth.service';
import * as templatesRepo from '@/server/repos/templates.repo';
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

const createInput = z.object({
  key: z.string().min(1).max(80).regex(/^[a-z][a-z0-9-]{0,79}$/),
  title: z.string().min(1).max(160),
  description: z.string().max(4000).optional(),
  schema: z.object({
    version: z.literal(1),
    fields: z.array(formFieldInput).min(1).max(50),
  }),
});

export const GET = handleApi(async () => {
  await requireAdmin();
  const db = getSql();
  const templates = await templatesRepo.list(db);
  return NextResponse.json({ templates }, { headers: noStore() });
});

export const POST = handleApi(async (request: NextRequest) => {
  const admin = await requireAdminMutation(request);
  const data = createInput.parse(await request.json().catch(() => null));
  const db = getSql();
  const parsed = incidentFormSchema.parse(data.schema);
  await templatesRepo.upsert(db, {
    key: data.key,
    title: data.title,
    description: data.description ?? null,
    schema: parsed,
  });
  return NextResponse.json({ key: data.key }, { status: 201, headers: noStore() });
});
