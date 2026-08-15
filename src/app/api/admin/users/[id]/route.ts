import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApi } from '@/server/errors';
import { getSql } from '@/server/db/client';
import { noStore } from '@/server/http';
import { requireAdmin, requireAdminMutation } from '@/server/services/auth.service';
import * as adminsRepo from '@/server/repos/admins.repo';
import * as auditRepo from '@/server/repos/audit.repo';
import { AppError } from '@/server/errors';

export const dynamic = 'force-dynamic';

const updateInput = z.object({
  role: z.enum(['admin', 'moderator']).optional(),
});

export const PATCH = handleApi(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const admin = await requireAdminMutation(request);
    if (admin.role !== 'admin') throw AppError.forbidden('Administrators only');
    if (id === admin.id) throw AppError.badRequest('Cannot change your own role');
    const data = updateInput.parse(await request.json().catch(() => null));
    const db = getSql();
    if (data.role) {
      const changed = await adminsRepo.updateRole(db, id, data.role);
      if (!changed) throw AppError.notFound('User not found');
      await auditRepo.record(db, {
        actorType: 'admin',
        actorId: admin.id,
        eventType: 'admin_role_changed',
        metadata: { targetId: id, newRole: data.role },
      });
    }
    return NextResponse.json({ ok: true }, { headers: noStore() });
  },
);

export const DELETE = handleApi(
  async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const admin = await requireAdmin();
    if (admin.role !== 'admin') throw AppError.forbidden('Administrators only');
    if (id === admin.id) throw AppError.badRequest('Cannot delete your own account');
    const db = getSql();
    const user = await adminsRepo.findById(db, id);
    if (!user) throw AppError.notFound('User not found');
    const count = await adminsRepo.count(db);
    if (count <= 1) throw AppError.badRequest('Cannot delete the last administrator');
    const removed = await adminsRepo.remove(db, id);
    if (!removed) throw AppError.notFound('User not found');
    await auditRepo.record(db, {
      actorType: 'admin',
      actorId: admin.id,
      eventType: 'admin_removed',
      metadata: { targetId: id, email: user.email },
    });
    return NextResponse.json({ ok: true }, { headers: noStore() });
  },
);
