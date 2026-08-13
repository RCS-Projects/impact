import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApi } from '@/server/errors';
import { noStore } from '@/server/http';
import { requireAdmin, requireAdminMutation } from '@/server/services/auth.service';
import { getById, update } from '@/server/services/incidents.service';

export const dynamic = 'force-dynamic';

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
    const admin = await requireAdminMutation(request);
    const raw = await request.json().catch(() => null);
    const data = updateInput.parse(raw);
    const result = await update(params.id, data, admin);
    return NextResponse.json(result, { headers: noStore() });
  },
);
