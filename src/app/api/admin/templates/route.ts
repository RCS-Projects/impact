import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApi } from '@/server/errors';
import { getSql } from '@/server/db/client';
import { noStore } from '@/server/http';
import { requireAdmin, requireAdminRole } from '@/server/services/auth.service';
import * as templatesRepo from '@/server/repos/templates.repo';
import { incidentFormSchema } from '@/server/schema/form-schema';

export const dynamic = 'force-dynamic';

const createInput = z.object({
  key: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z][a-z0-9-]{0,79}$/),
  title: z.string().min(1).max(160),
  description: z.string().max(4000).optional(),
  schema: incidentFormSchema,
});

export const GET = handleApi(async () => {
  await requireAdmin();
  const db = getSql();
  const templates = await templatesRepo.list(db);
  return NextResponse.json({ templates }, { headers: noStore() });
});

export const POST = handleApi(async (request: NextRequest) => {
  const admin = await requireAdminRole(request);
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
