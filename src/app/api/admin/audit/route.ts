import { NextRequest, NextResponse } from 'next/server';
import { handleApi } from '@/server/errors';
import { getSql } from '@/server/db/client';
import { noStore } from '@/server/http';
import { requireAdmin } from '@/server/services/auth.service';
import * as auditRepo from '@/server/repos/audit.repo';

export const dynamic = 'force-dynamic';

export const GET = handleApi(async (request: NextRequest) => {
  await requireAdmin();
  const url = new URL(request.url);
  const incidentId = url.searchParams.get('incidentId') || undefined;
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 100), 500);
  const offset = Number(url.searchParams.get('offset') ?? 0);
  const db = getSql();
  const events = await auditRepo.listGlobal(db, { incidentId, limit, offset });
  return NextResponse.json({ events }, { headers: noStore() });
});
