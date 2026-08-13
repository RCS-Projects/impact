import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApi } from '@/server/errors';
import { clientIp, noStore } from '@/server/http';
import { authCookies, login } from '@/server/services/auth.service';
import { hmacIp } from '@/server/security/hashing';

const input = z.object({
  login: z.string().min(1).max(254),
  password: z.string().min(1).max(128),
});

export const POST = handleApi(async (request: NextRequest) => {
  const data = input.parse(await request.json().catch(() => null));
  const { jwt, csrf } = await login(data.login, data.password, hmacIp(clientIp(request)));
  const response = NextResponse.json({ ok: true }, { headers: noStore() });
  for (const cookie of authCookies(jwt, csrf))
    response.cookies.set(cookie.name, cookie.value, cookie.options);
  return response;
});
