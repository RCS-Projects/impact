import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApi } from '@/server/errors';
import { noStore } from '@/server/http';
import { requireAdminMutation } from '@/server/services/auth.service';
import { applyAction } from '@/server/services/moderation.service';

const input = z.object({
  action: z.enum(['verify', 'flag', 'resolve', 'reject', 'remove', 'restore']),
  note: z.string().max(500).optional(),
});

export const POST = handleApi(
  async (request: NextRequest, { params }: { params: { id: string } }) => {
    const admin = await requireAdminMutation(request);
    const data = input.parse(await request.json().catch(() => null));
    await applyAction(params.id, data.action, admin, data.note);
    return NextResponse.json({ ok: true }, { headers: noStore() });
  },
);
