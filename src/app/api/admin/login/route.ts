import bcrypt from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSession, sessionCookie } from '@/lib/auth';
import { getSql } from '@/lib/db';

const input = z.object({ login: z.string().min(1).max(254), password: z.string().min(1).max(128) });
export async function POST(request: NextRequest) {
  const data = input.safeParse(await request.json().catch(() => null));
  if (!data.success)
    return NextResponse.json({ error: 'Invalid sign-in request' }, { status: 400 });
  const login = data.data.login.includes('@')
    ? data.data.login.toLowerCase()
    : `${data.data.login.toLowerCase()}@local.impact`;
  const rows = await getSql()<
    { id: string; email: string; role: 'admin' | 'moderator'; password_hash: string }[]
  >`SELECT id, email, role, password_hash FROM administrators WHERE email = ${login} LIMIT 1`;
  const admin = rows[0];
  if (!admin || !(await bcrypt.compare(data.data.password, admin.password_hash)))
    return NextResponse.json({ error: 'Invalid login or password' }, { status: 401 });
  await getSql()`UPDATE administrators SET last_login_at = now() WHERE id = ${admin.id}`;
  const token = await createSession({ id: admin.id, email: admin.email, role: admin.role });
  const response = NextResponse.json({ ok: true });
  const cookie = sessionCookie(token);
  response.cookies.set(cookie.name, cookie.value, cookie.options);
  return response;
}
