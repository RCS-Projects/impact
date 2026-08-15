import type { ReportStatus } from '@/shared/types';
import { AppError } from '../errors';
import { getSql } from '../db/client';
import * as auditRepo from '../repos/audit.repo';
import * as moderationRepo from '../repos/moderation.repo';
import * as reportsPrivateRepo from '../repos/reports-private.repo';
import type { AdminSession } from './auth.service';

const ACTION_TO_STATUS: Record<string, ReportStatus> = {
  verify: 'verified',
  flag: 'flagged',
  resolve: 'resolved',
  reject: 'rejected',
  remove: 'removed',
  restore: 'unverified',
};

export function listQueue(
  options: {
    incidentId?: string;
    statuses?: ReportStatus[];
    privacy?: string;
    suspiciousReason?: string;
    hasPhoto?: boolean;
    since?: string;
    limit?: number;
    offset?: number;
  },
  _admin: AdminSession,
) {
  return moderationRepo.listQueue(getSql(), options);
}

export function countQueue(
  options: {
    incidentId?: string;
    statuses?: ReportStatus[];
    privacy?: string;
    suspiciousReason?: string;
    hasPhoto?: boolean;
    since?: string;
  },
  _admin: AdminSession,
) {
  return moderationRepo.countQueue(getSql(), options);
}

export async function applyAction(
  reportId: string,
  action: string,
  admin: AdminSession,
  note?: string,
) {
  const status = ACTION_TO_STATUS[action];
  if (!status) throw AppError.badRequest('Unknown moderation action');
  const db = getSql();
  const incidentId = await moderationRepo.setStatus(db, reportId, status);
  if (!incidentId) throw AppError.notFound('Report not found');
  await auditRepo.record(db, {
    incidentId,
    reportId,
    actorType: 'admin',
    actorId: admin.id,
    eventType: 'report_status_changed',
    metadata: { status, ...(note ? { note } : {}) },
  });
}

export async function batchApplyAction(
  reportIds: string[],
  action: string,
  admin: AdminSession,
  note?: string,
) {
  const status = ACTION_TO_STATUS[action];
  if (!status) throw AppError.badRequest('Unknown moderation action');
  if (reportIds.length === 0) throw AppError.badRequest('No reports selected');
  const db = getSql();
  const updated = await moderationRepo.batchSetStatus(db, reportIds, status);
  for (const row of updated) {
    await auditRepo.record(db, {
      incidentId: row.incidentId,
      reportId: row.id,
      actorType: 'admin',
      actorId: admin.id,
      eventType: 'report_status_changed',
      metadata: { status, batch: true, ...(note ? { note } : {}) },
    });
  }
  return { updated: updated.length };
}

export async function getTrueLocation(reportId: string, admin: AdminSession) {
  if (admin.role !== 'admin') throw AppError.forbidden('Administrators only');
  const db = getSql();
  const row = await reportsPrivateRepo.getTrueLocation(db, reportId);
  if (!row) throw AppError.notFound('Report not found');
  await auditRepo.record(db, {
    reportId,
    actorType: 'admin',
    actorId: admin.id,
    eventType: 'true_location_viewed',
  });
  return row;
}
