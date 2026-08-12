import bcrypt from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSession, sessionCookie } from '@/lib/auth';
import { getSql } from '@/lib/db';
import { getEnv } from '@/lib/env';

const input = z.object({
  email: z.string().email(),
  bootstrapSecret: z.string().min(32),
  password: z.string().min(14).max(128),
});
export async function POST(request: NextRequest) {
  const data = input.safeParse(await request.json().catch(() => null));
  if (!data.success) return NextResponse.json({ error: 'Invalid setup request' }, { status: 400 });
  const env = getEnv();
  if (!env.ADMIN_BOOTSTRAP_EMAIL || !env.ADMIN_BOOTSTRAP_SECRET)
    return NextResponse.json(
      { error: 'Administrator bootstrap is not configured' },
      { status: 503 },
    );
  if (
    data.data.email.toLowerCase() !== env.ADMIN_BOOTSTRAP_EMAIL.toLowerCase() ||
    data.data.bootstrapSecret !== env.ADMIN_BOOTSTRAP_SECRET
  )
    return NextResponse.json({ error: 'Invalid bootstrap credentials' }, { status: 403 });
  const sql = getSql();
  const existing = await sql<
    { count: number }[]
  >`SELECT count(*)::int AS count FROM administrators`;
  if ((existing[0]?.count ?? 0) > 0)
    return NextResponse.json({ error: 'An administrator already exists' }, { status: 409 });
  const passwordHash = await bcrypt.hash(data.data.password, 12);
  const rows = await sql<
    { id: string; email: string; role: 'admin' }[]
  >`INSERT INTO administrators (email, password_hash, role) VALUES (${data.data.email.toLowerCase()}, ${passwordHash}, 'admin') RETURNING id, email, role`;
  const token = await createSession(rows[0]);
  const response = NextResponse.json({ ok: true });
  const cookie = sessionCookie(token);
  response.cookies.set(cookie.name, cookie.value, cookie.options);
  return response;
}
