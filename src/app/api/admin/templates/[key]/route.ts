import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApi } from '@/server/errors';
import { getSql } from '@/server/db/client';
import { noStore } from '@/server/http';
import { requireAdmin, requireAdminMutation } from '@/server/services/auth.service';
import * as templatesRepo from '@/server/repos/templates.repo';
import { incidentFormSchema } from '@/server/schema/form-schema';
import { AppError } from '@/server/errors';

export const dynamic = 'force-dynamic';

const updateInput = z.object({
  title: z.string().min(1).max(160).optional(),
  description: z.string().max(4000).nullish(),
  schema: incidentFormSchema.optional(),
});

export const GET = handleApi(
  async (_request: NextRequest, { params }: { params: Promise<{ key: string }> }) => {
    const { key } = await params;
    await requireAdmin();
    const db = getSql();
    const template = await templatesRepo.findByKey(db, key);
    if (!template) throw AppError.notFound('Template not found');
    return NextResponse.json({ template }, { headers: noStore() });
  },
);

export const PATCH = handleApi(
  async (request: NextRequest, { params }: { params: Promise<{ key: string }> }) => {
    const { key } = await params;
    const admin = await requireAdminMutation(request);
    const data = updateInput.parse(await request.json().catch(() => null));
    const db = getSql();
    const existing = await templatesRepo.findByKey(db, key);
    if (!existing) throw AppError.notFound('Template not found');
    const parsed = data.schema ? incidentFormSchema.parse(data.schema) : existing.schema;
    await templatesRepo.upsert(db, {
      key,
      title: data.title ?? existing.title,
      description: data.description !== undefined ? data.description || null : existing.description,
      schema: parsed,
    });
    return NextResponse.json({ ok: true }, { headers: noStore() });
  },
);

export const DELETE = handleApi(
  async (_request: NextRequest, { params }: { params: Promise<{ key: string }> }) => {
    const { key } = await params;
    await requireAdminMutation(_request);
    const db = getSql();
    const existing = await templatesRepo.findByKey(db, key);
    if (!existing) throw AppError.notFound('Template not found');
    await templatesRepo.remove(db, key);
    return NextResponse.json({ ok: true }, { headers: noStore() });
  },
);
