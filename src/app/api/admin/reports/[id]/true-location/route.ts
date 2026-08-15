import { NextRequest, NextResponse } from 'next/server';
import { handleApi } from '@/server/errors';
import { noStore } from '@/server/http';
import { requireAdmin } from '@/server/services/auth.service';
import { getTrueLocation } from '@/server/services/moderation.service';

export const dynamic = 'force-dynamic';

export const GET = handleApi(
  async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const admin = await requireAdmin();
    const location = await getTrueLocation(id, admin);
    return NextResponse.json({ location }, { headers: noStore() });
  },
);
