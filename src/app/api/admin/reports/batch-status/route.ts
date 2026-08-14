import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApi } from '@/server/errors';
import { noStore } from '@/server/http';
import { requireAdminMutation } from '@/server/services/auth.service';
import { batchApplyAction } from '@/server/services/moderation.service';

const input = z.object({
  reportIds: z.array(z.string().uuid()).min(1).max(100),
  action: z.enum(['verify', 'flag', 'resolve', 'reject', 'remove', 'restore']),
  note: z.string().max(500).optional(),
});

export const POST = handleApi(async (request: NextRequest) => {
  const admin = await requireAdminMutation(request);
  const data = input.parse(await request.json().catch(() => null));
  const result = await batchApplyAction(data.reportIds, data.action, admin, data.note);
  return NextResponse.json(result, { headers: noStore() });
});
