import { NextRequest, NextResponse } from 'next/server';
import { handleApi } from '@/server/errors';
import { noStore } from '@/server/http';
import { requireAdminRole } from '@/server/services/auth.service';
import { publish } from '@/server/services/incidents.service';

export const POST = handleApi(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const admin = await requireAdminRole(request);
    await publish(id, admin);
    return NextResponse.json({ ok: true }, { headers: noStore() });
  },
);
