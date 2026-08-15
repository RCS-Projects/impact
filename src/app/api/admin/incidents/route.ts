import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApi } from '@/server/errors';
import { noStore } from '@/server/http';
import { requireAdmin, requireAdminRole } from '@/server/services/auth.service';
import { createDraft, listForAdmin, dashboardStats } from '@/server/services/incidents.service';
import { reportGeometryModeSchema } from '@/server/schema/report-geometry';

export const dynamic = 'force-dynamic';

const createInput = z.object({
  title: z.string().min(3).max(160),
  description: z.string().max(4000).optional(),
  templateKey: z.string().min(1).max(80),
  center: z.object({
    latitude: z.number().min(41).max(84),
    longitude: z.number().min(-142).max(-52),
    zoom: z.number().min(3).max(18),
  }),
  reportingArea: z.unknown().optional(),
  reportExpiryDays: z.number().int().min(1).max(365).nullish(),
  reportGeometryMode: reportGeometryModeSchema.default('point'),
});

export const GET = handleApi(async () => {
  await requireAdmin();
  const [incidents, stats] = await Promise.all([listForAdmin(), dashboardStats()]);
  return NextResponse.json({ incidents, stats }, { headers: noStore() });
});

export const POST = handleApi(async (request: NextRequest) => {
  const admin = await requireAdminRole(request);
  const data = createInput.parse(await request.json().catch(() => null));
  const created = await createDraft(data, admin);
  return NextResponse.json(created, { status: 201, headers: noStore() });
});
