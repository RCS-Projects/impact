import { NextRequest, NextResponse } from 'next/server';
import { handleApi } from '@/server/errors';
import { noStore } from '@/server/http';
import { requireAdminMutation } from '@/server/services/auth.service';
import { close } from '@/server/services/incidents.service';

export const POST = handleApi(
  async (request: NextRequest, { params }: { params: { id: string } }) => {
    const admin = await requireAdminMutation(request);
    await close(params.id, admin);
    return NextResponse.json({ ok: true }, { headers: noStore() });
  },
);
