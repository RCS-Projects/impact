import { AppError } from '../errors';
import { getSql } from '../db/client';
import * as auditRepo from '../repos/audit.repo';
import * as incidentsRepo from '../repos/incidents.repo';
import type { IncidentPublicRow } from '../repos/incidents.repo';
import * as templatesRepo from '../repos/templates.repo';
import { incidentFormSchema } from '../schema/form-schema';
import { parseDisplaySettings, parseReportingArea } from '../schema/incident-schema';
import { reportGeometryModeSchema } from '../schema/report-geometry';
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

export interface CreateIncidentInput {
  title: string;
  description?: string;
  templateKey: string;
  center: { latitude: number; longitude: number; zoom: number };
  reportingArea?: unknown;
  reportExpiryDays?: number | null;
  reportGeometryMode?: 'point' | 'polygon' | 'point_or_polygon';
}

export async function createDraft(input: CreateIncidentInput, admin: AdminSession) {
  const db = getSql();
  const template = await templatesRepo.findByKey(db, input.templateKey);
  if (!template) throw AppError.notFound('Template not found');
  const formSchema = incidentFormSchema.parse(template.schema);

  const areaGeoJson = parseReportingArea(input.reportingArea);

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
    reportGeometryMode: input.reportGeometryMode ?? 'point',
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

export async function archive(incidentId: string, admin: AdminSession) {
  const db = getSql();
  const archived = await incidentsRepo.archive(db, incidentId);
  if (!archived) throw AppError.conflict('Only closed incidents can be archived');
  await auditRepo.record(db, {
    incidentId,
    actorType: 'admin',
    actorId: admin.id,
    eventType: 'incident_archived',
  });
}

export async function getById(incidentId: string) {
  const db = getSql();
  const row = await incidentsRepo.findByIdForAdmin(db, incidentId);
  if (!row) throw AppError.notFound('Incident not found');
  return row;
}

export interface UpdateIncidentInput {
  title?: string;
  description?: string;
  center?: { latitude: number; longitude: number };
  zoom?: number;
  reportingArea?: unknown;
  displaySettings?: unknown;
  reportExpiryDays?: number | null;
  formSchema?: { version: 1; fields: unknown[] };
  reportGeometryMode?: 'point' | 'polygon' | 'point_or_polygon';
}

export async function update(incidentId: string, input: UpdateIncidentInput, admin: AdminSession) {
  const db = getSql();
  const existing = await incidentsRepo.findByIdForAdmin(db, incidentId);
  if (!existing) throw AppError.notFound('Incident not found');

  const sets: {
    title?: string;
    description?: string;
    longitude?: number;
    latitude?: number;
    zoom?: number;
    reportingAreaGeoJson?: string | null;
    displaySettings?: unknown;
    reportExpiryDays?: number | null;
    formSchema?: unknown;
    reportGeometryMode?: 'point' | 'polygon' | 'point_or_polygon';
  } = {};

  if (input.title !== undefined) sets.title = input.title;
  if (input.description !== undefined) sets.description = input.description || undefined;
  if (input.center !== undefined) {
    sets.longitude = input.center.longitude;
    sets.latitude = input.center.latitude;
  }
  if (input.zoom !== undefined) sets.zoom = input.zoom;
  if (input.reportGeometryMode !== undefined) sets.reportGeometryMode = reportGeometryModeSchema.parse(input.reportGeometryMode);

  if (input.reportingArea !== undefined) {
    if (input.reportingArea === null) {
      sets.reportingAreaGeoJson = null;
    } else {
      sets.reportingAreaGeoJson = parseReportingArea(input.reportingArea);
    }
  }

  if (input.displaySettings !== undefined) {
    sets.displaySettings = parseDisplaySettings(input.displaySettings);
  }

  if (input.reportExpiryDays !== undefined) {
    sets.reportExpiryDays = input.reportExpiryDays ?? null;
  }

  if (input.formSchema !== undefined) {
    const nextSchema = incidentFormSchema.parse(input.formSchema);
    const oldSchema = incidentFormSchema.parse(existing.formSchema);
    const oldByKey = new Map(oldSchema.fields.map((field) => [field.key, field]));
    const nextByKey = new Map(nextSchema.fields.map((field) => [field.key, field]));
    if (existing.status !== 'draft') {
      for (const oldField of oldSchema.fields) {
        const nextField = nextByKey.get(oldField.key);
        if (!nextField || nextField.type !== oldField.type) {
          throw AppError.conflict(`Published form field "${oldField.label}" cannot be removed or change type`);
        }
      }
      if ((await incidentsRepo.reportCount(db, incidentId)) > 0) {
        for (const oldField of oldSchema.fields) {
          const nextField = nextByKey.get(oldField.key)!;
          const oldChoices = new Set((oldField.choices ?? []).map((choice) => choice.value));
          const nextChoices = new Set((nextField.choices ?? []).map((choice) => choice.value));
          for (const choice of oldChoices) {
            if (!nextChoices.has(choice)) {
              throw AppError.conflict(`Choice "${choice}" cannot be removed while reports use this form`);
            }
          }
        }
      }
    }
    sets.formSchema = nextSchema;
  }

  const changed = await incidentsRepo.update(db, incidentId, sets);
  if (!changed) throw AppError.badRequest('No changes to save');

  const changedFields = Object.keys(sets);
  await auditRepo.record(db, {
    incidentId,
    actorType: 'admin',
    actorId: admin.id,
    eventType: 'incident_updated',
    metadata: { changedFields },
  });
  return { id: incidentId, changedFields };
}

export function listForAdmin() {
  return incidentsRepo.listForAdmin(getSql());
}

export function dashboardStats() {
  return incidentsRepo.dashboardStats(getSql());
}

export async function duplicate(incidentId: string, admin: AdminSession) {
  const db = getSql();
  const source = await incidentsRepo.findByIdForAdmin(db, incidentId);
  if (!source) throw AppError.notFound('Incident not found');
  const row = await incidentsRepo.duplicate(db, incidentId, newPublicId(), slugify(`${source.title} copy`));
  if (!row) throw new AppError(500, 'internal', 'Could not duplicate incident');
  await auditRepo.record(db, { incidentId: row.id, actorType: 'admin', actorId: admin.id, eventType: 'incident_duplicated', metadata: { sourceIncidentId: incidentId } });
  return { id: row.id, url: publicUrl(row) };
}

export { PUBLIC_ID_PATTERN };
