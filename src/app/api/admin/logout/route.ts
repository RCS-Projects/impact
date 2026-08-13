import { NextResponse } from 'next/server';
import { handleApi } from '@/server/errors';
import { noStore } from '@/server/http';
import { clearedAuthCookies } from '@/server/services/auth.service';

export const POST = handleApi(async () => {
  const response = NextResponse.json({ ok: true }, { headers: noStore() });
  for (const cookie of clearedAuthCookies())
    response.cookies.set(cookie.name, cookie.value, cookie.options);
  return response;
});
