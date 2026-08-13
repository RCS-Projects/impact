import { NextRequest, NextResponse } from 'next/server';
import type { ReportStatus } from '@/shared/types';
import { handleApi } from '@/server/errors';
import { noStore } from '@/server/http';
import { requireAdmin } from '@/server/services/auth.service';
import { listQueue } from '@/server/services/moderation.service';

export const dynamic = 'force-dynamic';

const VALID_STATUSES = new Set([
  'unverified',
  'verified',
  'flagged',
  'resolved',
  'rejected',
  'removed',
]);

export const GET = handleApi(async (request: NextRequest) => {
  const admin = await requireAdmin();
  const incidentId = request.nextUrl.searchParams.get('incidentId') ?? undefined;
  const statusParam = request.nextUrl.searchParams.get('status');
  const statuses = statusParam
    ? (statusParam.split(',').filter((s) => VALID_STATUSES.has(s)) as ReportStatus[])
    : undefined;
  const reports = await listQueue({ incidentId, statuses }, admin);
  return NextResponse.json({ reports }, { headers: noStore() });
});
