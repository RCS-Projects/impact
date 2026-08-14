import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApi } from '@/server/errors';
import { getSql } from '@/server/db/client';
import { noStore } from '@/server/http';
import { requireAdmin, requireAdminMutation } from '@/server/services/auth.service';
import * as adminsRepo from '@/server/repos/admins.repo';
import { hashPassword } from '@/server/security/tokens';
import { AppError } from '@/server/errors';

export const dynamic = 'force-dynamic';

const createInput = z.object({
  email: z.string().email().max(200),
  password: z.string().min(12).max(200),
  role: z.enum(['admin', 'moderator']),
});

export const GET = handleApi(async () => {
  const admin = await requireAdmin();
  if (admin.role !== 'admin') throw AppError.forbidden('Administrators only');
  const db = getSql();
  const users = await adminsRepo.listAll(db);
  return NextResponse.json({ users }, { headers: noStore() });
});

export const POST = handleApi(async (request: NextRequest) => {
  const admin = await requireAdminMutation(request);
  if (admin.role !== 'admin') throw AppError.forbidden('Administrators only');
  const data = createInput.parse(await request.json().catch(() => null));
  const db = getSql();
  const existing = await adminsRepo.findByEmail(db, data.email.toLowerCase());
  if (existing) throw AppError.conflict('An account with this email already exists');
  const id = await adminsRepo.create(db, {
    email: data.email.toLowerCase(),
    passwordHash: await hashPassword(data.password),
    role: data.role,
  });
  return NextResponse.json({ id }, { status: 201, headers: noStore() });
});
