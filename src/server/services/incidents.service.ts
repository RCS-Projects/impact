import { z } from 'zod';
import { AppError } from '../errors';
import { getSql } from '../db/client';
import * as auditRepo from '../repos/audit.repo';
import * as incidentsRepo from '../repos/incidents.repo';
import type { IncidentPublicRow } from '../repos/incidents.repo';
import * as templatesRepo from '../repos/templates.repo';
import { incidentFormSchema } from '../schema/form-schema';
import { newPublicId } from '../security/tokens';
import type { AdminSession } from './auth.service';

const PUBLIC_ID_PATTERN = /^[23456789abcdefghjkmnpqrstuvwxyz]{8}$/;

export function parseReference(reference: string): { slug: string; publicId: string } | null {
  const match = /^(.+)-([23456789abcdefghjkmnpqrstuvwxyz]{8})$/.exec(reference);
  if (!match || !match[1] || !match[2]) return null;
  return { slug: match[1], publicId: match[2] };
}

export function publicUrl(row: { slug: string; publicId: string }): string {
  return `/map/${row.slug}-${row.publicId}`;
}

export function getPublicIncident(reference: string): Promise<IncidentPublicRow | null> {
  const parsed = parseReference(reference);
  if (!parsed) return Promise.resolve(null);
  return incidentsRepo.findPublicByReference(getSql(), parsed.slug, parsed.publicId);
}

export function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 70) || 'incident'
  );
}

const geoJsonAreaSchema = z.union([
  z.object({ type: z.literal('Polygon'), coordinates: z.array(z.unknown()) }),
  z.object({ type: z.literal('MultiPolygon'), coordinates: z.array(z.unknown()) }),
]);

export interface CreateIncidentInput {
  title: string;
  description?: string;
  templateKey: string;
  center: { latitude: number; longitude: number; zoom: number };
  reportingArea?: unknown;
  reportExpiryDays?: number | null;
}

export async function createDraft(input: CreateIncidentInput, admin: AdminSession) {
  const db = getSql();
  const template = await templatesRepo.findByKey(db, input.templateKey);
  if (!template) throw AppError.notFound('Template not found');
  const formSchema = incidentFormSchema.parse(template.schema);

  let areaGeoJson: string | null = null;
  if (input.reportingArea !== undefined && input.reportingArea !== null) {
    const parsedArea = geoJsonAreaSchema.safeParse(input.reportingArea);
    if (!parsedArea.success)
      throw AppError.badRequest('Reporting area must be a GeoJSON Polygon or MultiPolygon');
    areaGeoJson = JSON.stringify(parsedArea.data);
  }

  const row = await incidentsRepo.create(db, {
    publicId: newPublicId(),
    slug: slugify(input.title),
    title: input.title,
    description: input.description ?? null,
    formSchema,
    longitude: input.center.longitude,
    latitude: input.center.latitude,
    zoom: input.center.zoom,
    reportingAreaGeoJson: areaGeoJson,
    reportExpiryDays: input.reportExpiryDays ?? null,
  });
  if (!row) throw new AppError(500, 'internal', 'Could not create incident');
  await auditRepo.record(db, {
    incidentId: row.id,
    actorType: 'admin',
    actorId: admin.id,
    eventType: 'incident_created',
    metadata: { templateKey: input.templateKey },
  });
  return { id: row.id, url: publicUrl(row) };
}

export async function publish(incidentId: string, admin: AdminSession) {
  const db = getSql();
  const published = await incidentsRepo.publish(db, incidentId);
  if (!published) throw AppError.conflict('Only draft incidents can be published');
  await auditRepo.record(db, {
    incidentId,
    actorType: 'admin',
    actorId: admin.id,
    eventType: 'incident_published',
  });
}

export async function close(incidentId: string, admin: AdminSession) {
  const db = getSql();
  const closed = await incidentsRepo.close(db, incidentId);
  if (!closed) throw AppError.conflict('Only live incidents can be closed');
  await auditRepo.record(db, {
    incidentId,
    actorType: 'admin',
    actorId: admin.id,
    eventType: 'incident_closed',
  });
}

export function listForAdmin() {
  return incidentsRepo.listForAdmin(getSql());
}

export function listPublicLive() {
  return incidentsRepo.listPublicLive(getSql());
}

export { PUBLIC_ID_PATTERN };
