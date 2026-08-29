import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApi } from '@/server/errors';
import { noStore } from '@/server/http';
import { requireAdmin, requireAdminRole } from '@/server/services/auth.service';
import { getById, remove, update } from '@/server/services/incidents.service';
import { incidentFormSchema } from '@/server/schema/form-schema';
import { displaySettingsInputSchema, reportingAreaSchema } from '@/server/schema/incident-schema';
import { reportGeometryModeSchema } from '@/server/schema/report-geometry';

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
  reportingArea: reportingAreaSchema.optional(),
  displaySettings: displaySettingsInputSchema.optional(),
  reportExpiryDays: z.number().int().min(1).max(365).nullish(),
  reportGeometryMode: reportGeometryModeSchema.optional(),
  formSchema: incidentFormSchema.optional(),
});

export const GET = handleApi(
  async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    await requireAdmin();
    const incident = await getById(id);
    return NextResponse.json({ incident }, { headers: noStore() });
  },
);

export const PATCH = handleApi(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const admin = await requireAdminRole(request);
    const raw = await request.json().catch(() => null);
    const data = updateInput.parse(raw);
    if (data.formSchema) {
      const parsed = incidentFormSchema.parse(data.formSchema);
      data.formSchema = parsed;
    }
    const result = await update(id, data, admin);
    return NextResponse.json(result, { headers: noStore() });
  },
);

export const DELETE = handleApi(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const admin = await requireAdminRole(request);
    await remove(id, admin);
    return NextResponse.json({ ok: true }, { headers: noStore() });
  },
);
