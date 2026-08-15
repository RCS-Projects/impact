import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApi } from '@/server/errors';
import { noStore } from '@/server/http';
import { getEditableReport, updateReport, deleteReport } from '@/server/services/reports.service';
import { reportGeometrySchema } from '@/server/schema/report-geometry';

export const GET = handleApi(
  async (_request: NextRequest, { params }: { params: Promise<{ id: string; token: string }> }) => {
    const { id, token } = await params;
    const report = await getEditableReport(id, token);
    return NextResponse.json(
      {
        answers: report.answers,
        privacy: report.locationPrivacy,
        latitude: report.latitude,
        longitude: report.longitude,
        placeLabel: report.placeLabel,
        schema: report.formSchema,
        status: report.status,
        incident: {
          title: report.incidentTitle,
          status: report.incidentStatus,
          reference: report.reference,
          reportingArea: report.reportingArea,
          reportGeometryMode: report.reportGeometryMode,
        },
        geometry: report.reportGeometry,
      },
      { headers: noStore() },
    );
  },
);

const updateInput = z.object({
  answers: z.record(z.unknown()),
  privacy: z.enum(['exact', 'approximate']),
  latitude: z.number().min(41).max(84),
  longitude: z.number().min(-142).max(-52),
  confirmExact: z.boolean().optional(),
  geometry: reportGeometrySchema.optional(),
});

export const PUT = handleApi(
  async (request: NextRequest, { params }: { params: Promise<{ id: string; token: string }> }) => {
    const { id, token } = await params;
    const data = updateInput.parse(await request.json().catch(() => null));
    await updateReport(id, token, {
      ...data,
      uploadClaimToken: (await cookies()).get('impact_upload_claim')?.value ?? null,
    });
    return NextResponse.json({ ok: true }, { headers: noStore() });
  },
);

export const DELETE = handleApi(
  async (request: NextRequest, { params }: { params: Promise<{ id: string; token: string }> }) => {
    const { id, token } = await params;
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1';
    await deleteReport(id, token, ip);
    return NextResponse.json({ ok: true }, { headers: noStore() });
  },
);
