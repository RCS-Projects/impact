import { PUBLIC_VISIBLE_STATUSES, type ReportStatus } from '@/shared/types';
import { AppError } from '../errors';
import { log } from '../log';
import { getSql } from '../db/client';
import * as auditRepo from '../repos/audit.repo';
import * as incidentsRepo from '../repos/incidents.repo';
import * as reportsRepo from '../repos/reports.repo';
import type { ReportBounds } from '../repos/reports.repo';
import * as reportsPrivateRepo from '../repos/reports-private.repo';
import * as uploadsRepo from '../repos/uploads.repo';
import { deriveFilters, incidentFormSchema, validateAnswers } from '../schema/form-schema';
import { hashBrowserToken, hashContent, hmacIp } from '../security/hashing';
import { approximatePoint, distanceMeters, PRIVACY_RADIUS_METERS } from '../security/privacy';
import { newOpaqueToken, verifyEditToken, hashEditToken } from '../security/tokens';
import * as captcha from './captcha.service';
import { reverseGeocode } from './geocode.service';
import * as rateLimit from './rate-limit.service';
import { getPublicIncident } from './incidents.service';
import { reportGeometrySchema, type ReportGeometry } from '../schema/report-geometry';

const OUTSIDE_AREA_MESSAGE = 'That location is outside this incident’s reporting area.';

function pointWkt(longitude: number, latitude: number): string {
  return `SRID=4326;POINT(${longitude} ${latitude})`;
}

function polygonAnchor(geometry: Extract<ReportGeometry, { type: 'Polygon' }>) {
  const points = geometry.coordinates[0] ?? [];
  if (points.length === 0) throw AppError.badRequest('Area needs at least one point');
  const west = Math.min(...points.map((point) => point[0]));
  const east = Math.max(...points.map((point) => point[0]));
  const south = Math.min(...points.map((point) => point[1]));
  const north = Math.max(...points.map((point) => point[1]));
  return { longitude: (west + east) / 2, latitude: (south + north) / 2 };
}

async function resolvePhotoAnswers(
  db: ReturnType<typeof getSql>,
  schema: ReturnType<typeof incidentFormSchema.parse>,
  answers: Record<string, unknown>,
  claimToken: string | null,
  reportId?: string,
) {
  const ids = schema.fields
    .filter((field) => field.type === 'photo')
    .map((field) => answers[field.key])
    .filter((value): value is { uploadId: string } =>
      Boolean(value && typeof value === 'object' && 'uploadId' in value),
    )
    .map((value) => value.uploadId);
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) return { answers, uploadIds: [] as string[] };

  const rowsById = new Map<string, Awaited<ReturnType<typeof uploadsRepo.findForClaim>>[number]>();
  if (claimToken) {
    const rows = await uploadsRepo.findForClaim(
      db,
      uniqueIds,
      hashBrowserToken(claimToken),
      reportId,
    );
    for (const row of rows) rowsById.set(row.id, row);
  }
  if (reportId && rowsById.size < uniqueIds.length) {
    const rows = await uploadsRepo.findForReport(db, uniqueIds, reportId);
    for (const row of rows) rowsById.set(row.id, row);
  }
  if (rowsById.size !== uniqueIds.length)
    throw AppError.forbidden('One or more photo uploads are not yours');

  const output = { ...answers };
  for (const field of schema.fields) {
    if (field.type !== 'photo') continue;
    const answer = answers[field.key];
    if (!answer || typeof answer !== 'object' || !('uploadId' in answer)) continue;
    const row = rowsById.get((answer as { uploadId: string }).uploadId);
    if (!row) throw AppError.forbidden('One or more photo uploads are not yours');
    output[field.key] = {
      uploadId: row.id,
      url: `/api/uploads/files/${row.filename}`,
      width: row.width,
      height: row.height,
    };
  }
  return { answers: output, uploadIds: uniqueIds };
}

export interface CreateReportInput {
  reference: string;
  latitude: number;
  longitude: number;
  privacy: 'exact' | 'approximate';
  answers: unknown;
  turnstileToken?: string;
  browserTokenCookie: string | null;
  uploadClaimToken?: string | null;
  ip: string;
  geometry?: unknown;
}

export async function createReport(
  input: CreateReportInput,
): Promise<{ reportId: string; editToken: string; browserToken: string; flagged: boolean }> {
  const db = getSql();
  const ipHash = hmacIp(input.ip);
  // Tests run multiple browser projects from the same host IP; keep the real
  // production limit but raise it in test runtime mode so E2E coverage is not
  // blocked by legitimate rate limiting.
  const isTestMode = process.env.IMPACT_RUNTIME_MODE === 'test';
  await rateLimit.enforce('report_submit', ipHash, isTestMode ? 1_000 : 8, 3_600);

  const incident = await getPublicIncident(input.reference);
  if (!incident) throw AppError.notFound('Incident not found');
  if (incident.status !== 'live') throw AppError.conflict('This incident is closed');

  const captchaResult = await captcha.verifyTurnstile(input.turnstileToken, ipHash);
  if (!captchaResult.ok) {
    await captcha.recordFailure(ipHash);
    throw AppError.badRequest('CAPTCHA verification failed');
  }

  const schema = incidentFormSchema.parse(incident.formSchema);
  const geometry = reportGeometrySchema.parse(
    input.geometry ?? { type: 'Point', coordinates: [input.longitude, input.latitude] },
  );
  const mode = incident.reportGeometryMode ?? 'point';
  if (mode === 'point' && geometry.type !== 'Point')
    throw AppError.badRequest('This incident accepts point reports only');
  if (mode === 'polygon' && geometry.type !== 'Polygon')
    throw AppError.badRequest('This incident accepts polygon reports only');
  const location =
    geometry.type === 'Polygon'
      ? polygonAnchor(geometry)
      : { latitude: input.latitude, longitude: input.longitude };
  // A submitted polygon is public as drawn. It does not use point fuzzing or a privacy circle.
  const privacy = geometry.type === 'Polygon' ? 'exact' : input.privacy;
  const answers = validateAnswers(schema, input.answers);
  const resolvedPhotos = await resolvePhotoAnswers(
    db,
    schema,
    answers,
    input.uploadClaimToken ?? null,
  );
  const derivedPlaceLabel =
    (await reverseGeocode(location.latitude, location.longitude))?.placeLabel ?? null;

  const privateWkt = pointWkt(location.longitude, location.latitude);
  if (geometry.type === 'Polygon') {
    if (!(await incidentsRepo.geofenceAllowsGeometry(db, incident.id, JSON.stringify(geometry))))
      throw AppError.unprocessable(
        'That area is invalid or outside this incident’s reporting area.',
      );
  } else if (!(await incidentsRepo.geofenceAllows(db, incident.id, privateWkt)))
    throw AppError.unprocessable(OUTSIDE_AREA_MESSAGE);

  const browserToken = input.browserTokenCookie ?? newOpaqueToken();
  const browserHash = hashBrowserToken(browserToken);
  const existing = await reportsRepo.findByBrowserHash(db, incident.id, browserHash);
  if (existing)
    throw AppError.conflict(
      'A report already exists for this browser on this incident. Use your private edit link to update it.',
    );

  // The browser token above prevents duplicate submissions from the same
  // browser. IP hashes are used for rate limiting only; shared networks must
  // not cause legitimate reports to be held for moderation.
  const contentHash = hashContent(answers);
  const suspicious: string[] = [];

  const editToken = newOpaqueToken();
  const publicPoint =
    privacy === 'approximate'
      ? approximatePoint(location.latitude, location.longitude)
      : { latitude: location.latitude, longitude: location.longitude };
  const status: ReportStatus = suspicious.length > 0 ? 'flagged' : 'unverified';
  const expiresAt = incident.reportExpiryDays
    ? new Date(Date.now() + incident.reportExpiryDays * 86_400_000)
    : null;

  const reportId = await db.begin(async (tx) => {
    const id = await reportsRepo.insert(tx, {
      incidentId: incident.id,
      schemaSnapshot: schema,
      answers: resolvedPhotos.answers,
      placeLabel: derivedPlaceLabel,
      privacy,
      publicPointWkt: pointWkt(publicPoint.longitude, publicPoint.latitude),
      reportGeometryGeoJson: JSON.stringify(geometry),
      radius: privacy === 'approximate' ? PRIVACY_RADIUS_METERS : null,
      browserTokenHash: browserHash,
      ipHash,
      editTokenHash: await hashEditToken(editToken),
      contentHash,
      status,
      suspiciousReasons: suspicious,
      expiresAt,
    });
    if (!id) throw new AppError(500, 'internal', 'Could not save report');
    if (resolvedPhotos.uploadIds.length) {
      const claimed = await uploadsRepo.claim(
        tx,
        resolvedPhotos.uploadIds,
        hashBrowserToken(input.uploadClaimToken ?? ''),
        id,
      );
      if (claimed.length !== resolvedPhotos.uploadIds.length)
        throw AppError.forbidden('One or more photo uploads are no longer available');
    }
    await reportsPrivateRepo.insertLocation(tx, id, privateWkt, derivedPlaceLabel);
    await auditRepo.record(tx, {
      incidentId: incident.id,
      reportId: id,
      actorType: 'public',
      eventType: 'report_created',
      metadata: {
        privacy,
        geometry: geometry.type,
        status,
        captchaBypassed: captchaResult.bypassed,
      },
    });
    return id;
  });

  log('report_created', {
    incidentId: incident.id,
    reportId,
    privacy,
    status,
  });

  try {
    const { broadcastToIncident } = await import('@/server/sse-bus');
    broadcastToIncident(input.reference, 'report_created', JSON.stringify({ reportId, status }));
  } catch {
    // SSE module may not be loadable server-side in all contexts
  }

  return { reportId, editToken, browserToken, flagged: status === 'flagged' };
}

export interface PublicQueryInput {
  reference: string;
  bounds?: ReportBounds;
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
  uploadClaimToken?: string | null;
  geometry?: unknown;
}

export async function updateReport(reportId: string, token: string, input: UpdateReportInput) {
  const db = getSql();
  const row = await reportsPrivateRepo.getForEdit(db, reportId);
  if (!row || !(await verifyEditToken(token, row.editTokenHash))) throw AppError.notFound();
  if (row.incidentStatus !== 'live')
    throw AppError.conflict('This incident is closed; reports can no longer be updated.');
  await rateLimit.enforce('report_edit', hashContent([reportId]), 20, 3_600);

  const schema = incidentFormSchema.parse(row.formSchema);
  const geometry = reportGeometrySchema.parse(
    input.geometry ??
      row.reportGeometry ?? { type: 'Point', coordinates: [input.longitude, input.latitude] },
  );
  if (row.reportGeometryMode === 'point' && geometry.type !== 'Point')
    throw AppError.badRequest('This incident accepts point reports only');
  if (row.reportGeometryMode === 'polygon' && geometry.type !== 'Polygon')
    throw AppError.badRequest('This incident accepts polygon reports only');
  if (
    row.locationPrivacy === 'approximate' &&
    input.privacy === 'exact' &&
    !input.confirmExact &&
    geometry.type !== 'Polygon'
  )
    throw AppError.conflict(
      'Explicit confirmation is required before publishing an exact location',
    );
  const location =
    geometry.type === 'Polygon'
      ? polygonAnchor(geometry)
      : { latitude: input.latitude, longitude: input.longitude };
  const privacy = geometry.type === 'Polygon' ? 'exact' : input.privacy;
  const answers = validateAnswers(schema, input.answers);
  const resolvedPhotos = await resolvePhotoAnswers(
    db,
    schema,
    answers,
    input.uploadClaimToken ?? null,
    reportId,
  );
  const derivedPlaceLabel =
    (await reverseGeocode(location.latitude, location.longitude))?.placeLabel ?? null;

  const privateWkt = pointWkt(location.longitude, location.latitude);
  if (geometry.type === 'Polygon') {
    if (!(await incidentsRepo.geofenceAllowsGeometry(db, row.incidentId, JSON.stringify(geometry))))
      throw AppError.unprocessable(
        'That area is invalid or outside this incident’s reporting area.',
      );
  } else if (!(await incidentsRepo.geofenceAllows(db, row.incidentId, privateWkt))) {
    throw AppError.unprocessable(OUTSIDE_AREA_MESSAGE);
  }

  const movedMeters = distanceMeters(
    row.latitude,
    row.longitude,
    location.latitude,
    location.longitude,
  );
  const locationChanged = movedMeters > 1;

  let publicPoint: { latitude: number; longitude: number };
  let radius: number | null;
  if (privacy === 'exact') {
    publicPoint = { latitude: location.latitude, longitude: location.longitude };
    radius = null;
  } else if (locationChanged || row.locationPrivacy === 'exact') {
    publicPoint = approximatePoint(location.latitude, location.longitude);
    radius = PRIVACY_RADIUS_METERS;
  } else {
    publicPoint = { latitude: row.publicLatitude, longitude: row.publicLongitude };
    radius = PRIVACY_RADIUS_METERS;
  }

  await reportsPrivateRepo.update(db, reportId, {
    answers: resolvedPhotos.answers,
    privacy,
    publicPointWkt: pointWkt(publicPoint.longitude, publicPoint.latitude),
    radius,
    privatePointWkt: privateWkt,
    placeLabel: derivedPlaceLabel,
    uploadIds: resolvedPhotos.uploadIds,
    uploadClaimHash: input.uploadClaimToken ? hashBrowserToken(input.uploadClaimToken) : undefined,
    reportGeometryGeoJson: JSON.stringify(geometry),
  });
  await auditRepo.record(db, {
    incidentId: row.incidentId,
    reportId,
    actorType: 'public',
    eventType: 'report_updated',
    metadata: { privacy, geometry: geometry.type, movedMeters: Math.round(movedMeters) },
  });
  log('report_updated', {
    reportId,
    privacy,
    geometry: geometry.type,
    movedMeters: Math.round(movedMeters),
  });
}

export async function deleteReport(reportId: string, editToken: string, ip: string) {
  const db = getSql();
  const ipHash = hmacIp(ip);
  await rateLimit.enforce('report_delete', ipHash, 5, 3_600);
  const row = await reportsPrivateRepo.getForEdit(db, reportId);
  if (!row) throw AppError.notFound('Report not found');
  if (!(await verifyEditToken(editToken, row.editTokenHash)))
    throw AppError.forbidden('Invalid edit token');
  const deleted = await reportsPrivateRepo.deleteReport(db, reportId);
  if (!deleted) throw AppError.notFound('Report not found');
  await auditRepo.record(db, {
    incidentId: row.incidentId,
    reportId,
    actorType: 'public',
    eventType: 'report_deleted_by_owner',
  });
}
