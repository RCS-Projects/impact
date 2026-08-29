import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { ReportStatus } from '@/shared/types';
import { handleApi } from '@/server/errors';
import { clientIp, noStore } from '@/server/http';
import { isProduction } from '@/server/env';
import { createReport, queryPublicReports } from '@/server/services/reports.service';
import { reportGeometrySchema } from '@/server/schema/report-geometry';

const submitInput = z.object({
  latitude: z.number().min(41).max(84),
  longitude: z.number().min(-142).max(-52),
  privacy: z.enum(['exact', 'approximate']),
  answers: z.record(z.unknown()),
  turnstileToken: z.string().max(4096).optional(),
  geometry: reportGeometrySchema.optional(),
});

export const POST = handleApi(
  async (request: NextRequest, { params }: { params: Promise<{ reference: string }> }) => {
    const { reference } = await params;
    const data = submitInput.parse(await request.json().catch(() => null));
    const result = await createReport({
      reference,
      latitude: data.latitude,
      longitude: data.longitude,
      privacy: data.privacy,
      answers: data.answers,
      turnstileToken: data.turnstileToken,
      browserTokenCookie: (await cookies()).get('impact_browser_token')?.value ?? null,
      uploadClaimToken: (await cookies()).get('impact_upload_claim')?.value ?? null,
      ip: clientIp(request),
      geometry: data.geometry,
    });
    const response = NextResponse.json(
      {
        reportId: result.reportId,
        editUrl: `/report/edit/${result.reportId}/${result.editToken}`,
        flagged: result.flagged,
      },
      { status: 201, headers: noStore() },
    );
    response.cookies.set('impact_browser_token', result.browserToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction(),
      maxAge: 60 * 60 * 24 * 365,
      path: '/',
    });
    return response;
  },
);

const boundsInput = z.object({
  west: z.coerce.number().min(-142).max(-52),
  south: z.coerce.number().min(41).max(84),
  east: z.coerce.number().min(-142).max(-52),
  north: z.coerce.number().min(41).max(84),
});

const STATUS_VALUES = new Set([
  'unverified',
  'verified',
  'flagged',
  'resolved',
  'rejected',
  'removed',
]);

export const GET = handleApi(
  async (request: NextRequest, { params }: { params: Promise<{ reference: string }> }) => {
    const { reference } = await params;
    const all = request.nextUrl.searchParams.get('all') === 'true';
    const bounds = boundsInput.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (
      !all &&
      (!bounds.success ||
        bounds.data.west > bounds.data.east ||
        bounds.data.south > bounds.data.north)
    )
      return NextResponse.json(
        { error: 'Valid map bounds are required', code: 'bad_request' },
        { status: 400, headers: noStore() },
      );

    const statusParam = request.nextUrl.searchParams.get('status');
    const statuses = statusParam
      ? (statusParam.split(',').filter((s) => STATUS_VALUES.has(s)) as ReportStatus[])
      : [];
    const fieldFilters: Record<string, string[]> = {};
    for (const [key, value] of request.nextUrl.searchParams.entries()) {
      if (!key.startsWith('filter[') || !key.endsWith(']')) continue;
      const fieldKey = key.slice(7, -1);
      if (!/^[a-z][a-z0-9_]{0,63}$/.test(fieldKey)) continue;
      const values = request.nextUrl.searchParams.getAll(key).flatMap((v) => v.split(','));
      fieldFilters[fieldKey] = [...new Set([...(fieldFilters[fieldKey] ?? []), ...values])];
    }

    const result = await queryPublicReports({
      reference,
      bounds: all ? undefined : bounds.data,
      statuses,
      fieldFilters,
    });
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'public, max-age=15, stale-while-revalidate=30' },
    });
  },
);
