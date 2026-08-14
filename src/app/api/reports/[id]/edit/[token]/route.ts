import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApi } from '@/server/errors';
import { noStore } from '@/server/http';
import { getEditableReport, updateReport, deleteReport } from '@/server/services/reports.service';

export const GET = handleApi(
  async (_request: NextRequest, { params }: { params: { id: string; token: string } }) => {
    const report = await getEditableReport(params.id, params.token);
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
        },
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
  placeLabel: z.string().max(120).optional(),
});

export const PUT = handleApi(
  async (request: NextRequest, { params }: { params: { id: string; token: string } }) => {
    const data = updateInput.parse(await request.json().catch(() => null));
    await updateReport(params.id, params.token, data);
    return NextResponse.json({ ok: true }, { headers: noStore() });
  },
);

export const DELETE = handleApi(
  async (request: NextRequest, { params }: { params: { id: string; token: string } }) => {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1';
    await deleteReport(params.id, params.token, ip);
    return NextResponse.json({ ok: true }, { headers: noStore() });
  },
);
