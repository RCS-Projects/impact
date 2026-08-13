import { PUBLIC_VISIBLE_STATUSES, type ReportStatus } from '@/shared/types';
import { AppError } from '../errors';
import { log } from '../log';
import { getSql } from '../db/client';
import * as auditRepo from '../repos/audit.repo';
import * as incidentsRepo from '../repos/incidents.repo';
import * as reportsRepo from '../repos/reports.repo';
import type { ReportBounds } from '../repos/reports.repo';
import * as reportsPrivateRepo from '../repos/reports-private.repo';
import { deriveFilters, incidentFormSchema, validateAnswers } from '../schema/form-schema';
import { hashBrowserToken, hashContent, hmacIp } from '../security/hashing';
import { approximatePoint, distanceMeters, PRIVACY_RADIUS_METERS } from '../security/privacy';
import { newOpaqueToken, verifyEditToken, hashEditToken } from '../security/tokens';
import * as captcha from './captcha.service';
import * as rateLimit from './rate-limit.service';
import { getPublicIncident } from './incidents.service';

const OUTSIDE_AREA_MESSAGE = 'That location is outside this incident’s reporting area.';

function pointWkt(longitude: number, latitude: number): string {
  return `SRID=4326;POINT(${longitude} ${latitude})`;
}

export interface CreateReportInput {
  reference: string;
  latitude: number;
  longitude: number;
  privacy: 'exact' | 'approximate';
  answers: unknown;
  placeLabel?: string;
  turnstileToken?: string;
  browserTokenCookie: string | null;
  ip: string;
}

export async function createReport(
  input: CreateReportInput,
): Promise<{ reportId: string; editToken: string; browserToken: string; flagged: boolean }> {
  const db = getSql();
  const ipHash = hmacIp(input.ip);
  await rateLimit.enforce('report_submit', ipHash, 8, 3_600);

  const incident = await getPublicIncident(input.reference);
  if (!incident) throw AppError.notFound('Incident not found');
  if (incident.status !== 'live') throw AppError.conflict('This incident is closed');

  const captchaResult = await captcha.verifyTurnstile(input.turnstileToken, ipHash);
  if (!captchaResult.ok) {
    await captcha.recordFailure(ipHash);
    throw AppError.badRequest('CAPTCHA verification failed');
  }

  const schema = incidentFormSchema.parse(incident.formSchema);
  const answers = validateAnswers(schema, input.answers);

  const privateWkt = pointWkt(input.longitude, input.latitude);
  if (!(await incidentsRepo.geofenceAllows(db, incident.id, privateWkt)))
    throw AppError.unprocessable(OUTSIDE_AREA_MESSAGE);

  const browserToken = input.browserTokenCookie ?? newOpaqueToken();
  const browserHash = hashBrowserToken(browserToken);
  const existing = await reportsRepo.findByBrowserHash(db, incident.id, browserHash);
  if (existing)
    throw AppError.conflict(
      'A report already exists for this browser on this incident. Use your private edit link to update it.',
    );

  const contentHash = hashContent(answers);
  const suspicious: string[] = [];
  if (await reportsRepo.contentHashExists(db, incident.id, contentHash))
    suspicious.push('duplicate_content');
  if ((await reportsRepo.countRecentByIp(db, incident.id, ipHash, 15)) >= 2)
    suspicious.push('rapid_submission');
  if ((await captcha.failureCount(ipHash)) >= 3) suspicious.push('captcha_failures');

  const editToken = newOpaqueToken();
  const publicPoint =
    input.privacy === 'approximate'
      ? approximatePoint(input.latitude, input.longitude)
      : { latitude: input.latitude, longitude: input.longitude };
  const status: ReportStatus = suspicious.length > 0 ? 'flagged' : 'unverified';
  const expiresAt = incident.reportExpiryDays
    ? new Date(Date.now() + incident.reportExpiryDays * 86_400_000)
    : null;

  const reportId = await db.begin(async (tx) => {
    const id = await reportsRepo.insert(tx, {
      incidentId: incident.id,
      schemaSnapshot: schema,
      answers,
      placeLabel: input.placeLabel ?? null,
      privacy: input.privacy,
      publicPointWkt: pointWkt(publicPoint.longitude, publicPoint.latitude),
      radius: input.privacy === 'approximate' ? PRIVACY_RADIUS_METERS : null,
      browserTokenHash: browserHash,
      ipHash,
      editTokenHash: await hashEditToken(editToken),
      contentHash,
      status,
      suspiciousReasons: suspicious,
      expiresAt,
    });
    if (!id) throw new AppError(500, 'internal', 'Could not save report');
    await reportsPrivateRepo.insertLocation(tx, id, privateWkt, input.placeLabel ?? null);
    await auditRepo.record(tx, {
      incidentId: incident.id,
      reportId: id,
      actorType: 'public',
      eventType: 'report_created',
      metadata: { privacy: input.privacy, status, captchaBypassed: captchaResult.bypassed },
    });
    return id;
  });

  log('report_created', {
    incidentId: incident.id,
    reportId,
    privacy: input.privacy,
    status,
  });
  return { reportId, editToken, browserToken, flagged: status === 'flagged' };
}

export interface PublicQueryInput {
  reference: string;
  bounds: ReportBounds;
  statuses: ReportStatus[];
  fieldFilters: Record<string, string[]>;
}

export async function queryPublicReports(input: PublicQueryInput) {
  const db = getSql();
  const incident = await getPublicIncident(input.reference);
  if (!incident) throw AppError.notFound('Incident not found');

  const statuses = input.statuses.filter((status) => PUBLIC_VISIBLE_STATUSES.includes(status));
  const filterDefinitions = deriveFilters(incidentFormSchema.parse(incident.formSchema));
  const fieldFilters: Record<string, string[]> = {};
  for (const [key, values] of Object.entries(input.fieldFilters)) {
    const definition = filterDefinitions.find((filter) => filter.key === key);
    if (!definition) continue;
    const allowed = new Set(definition.choices.map((choice) => choice.value));
    const valid = values.filter((value) => allowed.has(value));
    if (valid.length > 0) fieldFilters[key] = valid;
  }

  const reports = await reportsRepo.queryPublic(db, incident.id, input.bounds, {
    statuses,
    fieldFilters,
  });
  const { total, lastReportAt } = await reportsRepo.summary(db, incident.id);
  return { reports, total, lastReportAt };
}

export async function getEditableReport(reportId: string, token: string) {
  const db = getSql();
  const row = await reportsPrivateRepo.getForEdit(db, reportId);
  if (!row || !(await verifyEditToken(token, row.editTokenHash))) throw AppError.notFound();
  await auditRepo.record(db, {
    incidentId: row.incidentId,
    reportId,
    actorType: 'public',
    eventType: 'report_edit_viewed',
  });
  return row;
}

export interface UpdateReportInput {
  answers: unknown;
  privacy: 'exact' | 'approximate';
  latitude: number;
  longitude: number;
  confirmExact?: boolean;
  placeLabel?: string;
}

export async function updateReport(reportId: string, token: string, input: UpdateReportInput) {
  const db = getSql();
  const row = await reportsPrivateRepo.getForEdit(db, reportId);
  if (!row || !(await verifyEditToken(token, row.editTokenHash))) throw AppError.notFound();
  if (row.incidentStatus !== 'live')
    throw AppError.conflict('This incident is closed; reports can no longer be updated.');
  await rateLimit.enforce('report_edit', hashContent([reportId]), 20, 3_600);

  if (row.locationPrivacy === 'approximate' && input.privacy === 'exact' && !input.confirmExact)
    throw AppError.conflict(
      'Explicit confirmation is required before publishing an exact location',
    );

  const schema = incidentFormSchema.parse(row.formSchema);
  const answers = validateAnswers(schema, input.answers);

  const privateWkt = pointWkt(input.longitude, input.latitude);
  if (!(await incidentsRepo.geofenceAllows(db, row.incidentId, privateWkt)))
    throw AppError.unprocessable(OUTSIDE_AREA_MESSAGE);

  const movedMeters = distanceMeters(row.latitude, row.longitude, input.latitude, input.longitude);
  const locationChanged = movedMeters > 1;

  let publicPoint: { latitude: number; longitude: number };
  let radius: number | null;
  if (input.privacy === 'exact') {
    publicPoint = { latitude: input.latitude, longitude: input.longitude };
    radius = null;
  } else if (locationChanged || row.locationPrivacy === 'exact') {
    publicPoint = approximatePoint(input.latitude, input.longitude);
    radius = PRIVACY_RADIUS_METERS;
  } else {
    publicPoint = { latitude: row.publicLatitude, longitude: row.publicLongitude };
    radius = PRIVACY_RADIUS_METERS;
  }

  const suspicious = movedMeters > 50_000 ? ['implausible_move'] : undefined;
  await reportsPrivateRepo.update(db, reportId, {
    answers,
    privacy: input.privacy,
    publicPointWkt: pointWkt(publicPoint.longitude, publicPoint.latitude),
    radius,
    privatePointWkt: privateWkt,
    placeLabel: input.placeLabel ?? null,
    suspiciousReasons: suspicious,
  });
  await auditRepo.record(db, {
    incidentId: row.incidentId,
    reportId,
    actorType: 'public',
    eventType: 'report_updated',
    metadata: { privacy: input.privacy, movedMeters: Math.round(movedMeters) },
  });
  log('report_updated', { reportId, privacy: input.privacy, movedMeters: Math.round(movedMeters) });
}
