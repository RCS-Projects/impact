import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApi } from '@/server/errors';
import { noStore } from '@/server/http';
import { setupAdministrator } from '@/server/services/auth.service';

const input = z.object({
  email: z.string().email().max(254),
  password: z.string().min(12).max(128),
  secret: z.string().min(32).max(512),
});

export const POST = handleApi(async (request: NextRequest) => {
  const data = input.parse(await request.json().catch(() => null));
  await setupAdministrator(data.email, data.password, data.secret);
  return NextResponse.json({ ok: true }, { status: 201, headers: noStore() });
});
