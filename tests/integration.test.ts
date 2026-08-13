import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { loadDotEnv } from './helpers/env';
import { resetAndMigrate } from './helpers/db';

loadDotEnv();
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.APP_URL ??= 'http://localhost:3000';
process.env.SESSION_SECRET ??= 'test-session-secret-test-session-secret-test';
process.env.IP_HASH_SECRET ??= 'test-ip-hash-secret-test-ip-hash-secret-test';
process.env.NOMINATIM_SEARCH_URL ??= 'http://127.0.0.1:9/nominatim/search';
process.env.IMPACT_RUNTIME_MODE ??= 'development';
process.env.DEVELOPMENT_TURNSTILE_BYPASS ??= 'true';

const dbUrl = process.env.DATABASE_URL;

let available = false;
if (dbUrl) {
  const probe = postgres(dbUrl, { max: 1, connect_timeout: 3 });
  try {
    await probe`SELECT 1`;
    available = true;
  } catch {
    available = false;
  } finally {
    await probe.end();
  }
}

describe.runIf(available)('PostGIS integration', () => {
  const sql = postgres(dbUrl!, { max: 2 });

  const AREA = JSON.stringify({
    type: 'Polygon',
    coordinates: [
      [
        [-75.9, 45.2],
        [-75.4, 45.2],
        [-75.4, 45.7],
        [-75.9, 45.7],
        [-75.9, 45.2],
      ],
    ],
  });
  const INSIDE = { latitude: 45.42, longitude: -75.69 };
  const OUTSIDE = { latitude: 43.65, longitude: -79.38 };

  const stormAnswers = () => ({
    damage_type: 'tree_down',
    severity: 'minor',
    observed_at: new Date().toISOString(),
  });

  let stormSchema: import('@/server/schema/form-schema').IncidentFormSchema;
  let incidentsRepo: typeof import('@/server/repos/incidents.repo');
  let reportsRepo: typeof import('@/server/repos/reports.repo');
  let reportsPrivateRepo: typeof import('@/server/repos/reports-private.repo');
  let moderationRepo: typeof import('@/server/repos/moderation.repo');
  let auditRepo: typeof import('@/server/repos/audit.repo');
  let rateLimitRepo: typeof import('@/server/repos/rate-limit.repo');
  let geocodeCacheRepo: typeof import('@/server/repos/geocode-cache.repo');
  let templatesRepo: typeof import('@/server/repos/templates.repo');
  let reportsService: typeof import('@/server/services/reports.service');
  let distance: typeof import('@/server/security/privacy').distanceMeters;
  let tokens: typeof import('@/server/security/tokens');
  let stormDamageTemplate: import('@/server/templates/seed-templates').SeedTemplate;

  async function makeIncident(withArea: boolean) {
    const row = await incidentsRepo.create(sql, {
      publicId: tokens.newPublicId(),
      slug: 'test-storm',
      title: 'Test Storm',
      description: null,
      formSchema: stormSchema,
      longitude: -75.6972,
      latitude: 45.4215,
      zoom: 10,
      reportingAreaGeoJson: withArea ? AREA : null,
      reportExpiryDays: null,
    });
    if (!row) throw new Error('incident insert failed');
    return row;
  }

  beforeAll(async () => {
    await resetAndMigrate(sql);
    incidentsRepo = await import('@/server/repos/incidents.repo');
    reportsRepo = await import('@/server/repos/reports.repo');
    reportsPrivateRepo = await import('@/server/repos/reports-private.repo');
    moderationRepo = await import('@/server/repos/moderation.repo');
    auditRepo = await import('@/server/repos/audit.repo');
    rateLimitRepo = await import('@/server/repos/rate-limit.repo');
    geocodeCacheRepo = await import('@/server/repos/geocode-cache.repo');
    templatesRepo = await import('@/server/repos/templates.repo');
    reportsService = await import('@/server/services/reports.service');
    distance = (await import('@/server/security/privacy')).distanceMeters;
    tokens = await import('@/server/security/tokens');
    stormDamageTemplate = (await import('@/server/templates/seed-templates')).stormDamageTemplate;
    stormSchema = stormDamageTemplate.schema;
    await templatesRepo.upsert(sql, {
      key: stormDamageTemplate.key,
      title: stormDamageTemplate.title,
      description: stormDamageTemplate.description,
      schema: stormSchema,
    });
  });

  afterAll(async () => {
    await sql.end();
  });

  it('resolves permanent URLs only after publish, and keeps them after title change', async () => {
    const draft = await makeIncident(false);
    expect(await incidentsRepo.findPublicByReference(sql, draft.slug, draft.publicId)).toBeNull();
    expect(await incidentsRepo.publish(sql, draft.id)).toBe(true);
    const found = await incidentsRepo.findPublicByReference(sql, draft.slug, draft.publicId);
    expect(found?.title).toBe('Test Storm');
    await sql`UPDATE incidents SET title = ${'Renamed Storm'} WHERE id = ${draft.id}`;
    const renamed = await incidentsRepo.findPublicByReference(sql, draft.slug, draft.publicId);
    expect(renamed?.title).toBe('Renamed Storm');
    expect(renamed?.slug).toBe(draft.slug);
  });

  it('geofence accepts inside points and rejects outside points', async () => {
    const withArea = await makeIncident(true);
    const insideWkt = `SRID=4326;POINT(${INSIDE.longitude} ${INSIDE.latitude})`;
    const outsideWkt = `SRID=4326;POINT(${OUTSIDE.longitude} ${OUTSIDE.latitude})`;
    expect(await incidentsRepo.geofenceAllows(sql, withArea.id, insideWkt)).toBe(true);
    expect(await incidentsRepo.geofenceAllows(sql, withArea.id, outsideWkt)).toBe(false);

    const noArea = await makeIncident(false);
    expect(await incidentsRepo.geofenceAllows(sql, noArea.id, outsideWkt)).toBe(true);
  });

  it('runs the full submission pipeline with private/public separation', async () => {
    const incident = await makeIncident(true);
    await incidentsRepo.publish(sql, incident.id);
    const reference = `${incident.slug}-${incident.publicId}`;
    const answers = stormAnswers();

    const created = await reportsService.createReport({
      reference,
      latitude: INSIDE.latitude,
      longitude: INSIDE.longitude,
      privacy: 'approximate',
      answers,
      placeLabel: 'Test Village',
      browserTokenCookie: null,
      ip: '203.0.113.10',
    });
    expect(created.flagged).toBe(false);

    const editable = await reportsService.getEditableReport(created.reportId, created.editToken);
    expect(editable.latitude).toBeCloseTo(INSIDE.latitude, 6);
    expect(editable.longitude).toBeCloseTo(INSIDE.longitude, 6);

    const publicRows = await reportsRepo.queryPublic(
      sql,
      incident.id,
      { west: -76.5, south: 44.5, east: -74.5, north: 46.5 },
      { statuses: [], fieldFilters: {} },
    );
    expect(publicRows).toHaveLength(1);
    const publicRow = publicRows[0]!;
    expect(publicRow.radius).toBeCloseTo(152.4, 1);
    expect(
      distance(INSIDE.latitude, INSIDE.longitude, publicRow.latitude, publicRow.longitude),
    ).toBeLessThanOrEqual(153);
    expect(publicRow.latitude).not.toBeCloseTo(INSIDE.latitude, 5);
    expect(publicRow.placeLabel).toBe('Test Village');

    const summary = await reportsRepo.summary(sql, incident.id);
    expect(summary.total).toBe(1);
    expect(summary.lastReportAt).toBeTruthy();

    (globalThis as Record<string, unknown>).mainIncident = incident;
    (globalThis as Record<string, unknown>).mainCreated = created;
    (globalThis as Record<string, unknown>).mainAnswers = answers;
  });

  it('enforces one report per browser per incident', async () => {
    const incident = (globalThis as Record<string, unknown>).mainIncident as Awaited<
      ReturnType<typeof makeIncident>
    >;
    const created = (globalThis as Record<string, unknown>).mainCreated as {
      browserToken: string;
    };
    const reference = `${incident.slug}-${incident.publicId}`;
    await expect(
      reportsService.createReport({
        reference,
        latitude: INSIDE.latitude,
        longitude: INSIDE.longitude,
        privacy: 'approximate',
        answers: stormAnswers(),
        browserTokenCookie: created.browserToken,
        ip: '203.0.113.11',
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('flags duplicate content from a different browser', async () => {
    const incident = (globalThis as Record<string, unknown>).mainIncident as Awaited<
      ReturnType<typeof makeIncident>
    >;
    const answers = (globalThis as Record<string, unknown>).mainAnswers as Record<string, unknown>;
    const reference = `${incident.slug}-${incident.publicId}`;
    const duplicate = await reportsService.createReport({
      reference,
      latitude: 45.43,
      longitude: -75.68,
      privacy: 'exact',
      answers,
      browserTokenCookie: null,
      ip: '203.0.113.12',
    });
    expect(duplicate.flagged).toBe(true);
    const queue = await moderationRepo.listQueue(sql, {
      incidentId: incident.id,
      statuses: ['flagged'],
    });
    expect(queue.some((row) => row.id === duplicate.reportId)).toBe(true);
  });

  it('rejects submissions outside the reporting area', async () => {
    const incident = (globalThis as Record<string, unknown>).mainIncident as Awaited<
      ReturnType<typeof makeIncident>
    >;
    const reference = `${incident.slug}-${incident.publicId}`;
    await expect(
      reportsService.createReport({
        reference,
        latitude: OUTSIDE.latitude,
        longitude: OUTSIDE.longitude,
        privacy: 'exact',
        answers: stormAnswers(),
        browserTokenCookie: null,
        ip: '203.0.113.13',
      }),
    ).rejects.toMatchObject({ status: 422 });
  });

  it('rejects invalid edit tokens', async () => {
    const created = (globalThis as Record<string, unknown>).mainCreated as {
      reportId: string;
      editToken: string;
    };
    await expect(
      reportsService.getEditableReport(created.reportId, 'wrong-token'),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      reportsService.getEditableReport('00000000-0000-0000-0000-000000000000', created.editToken),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('requires explicit confirmation to upgrade approximate to exact', async () => {
    const created = (globalThis as Record<string, unknown>).mainCreated as {
      reportId: string;
      editToken: string;
    };
    const base = {
      answers: stormAnswers(),
      latitude: INSIDE.latitude,
      longitude: INSIDE.longitude,
      placeLabel: 'Test Village',
    };
    await expect(
      reportsService.updateReport(created.reportId, created.editToken, {
        ...base,
        privacy: 'exact',
      }),
    ).rejects.toMatchObject({ status: 409 });

    await reportsService.updateReport(created.reportId, created.editToken, {
      ...base,
      privacy: 'exact',
      confirmExact: true,
    });
    const editable = await reportsService.getEditableReport(created.reportId, created.editToken);
    expect(editable.publicLatitude).toBeCloseTo(INSIDE.latitude, 6);
    expect(editable.publicLongitude).toBeCloseTo(INSIDE.longitude, 6);
  });

  it('hides reports from the public map once removed', async () => {
    const incident = (globalThis as Record<string, unknown>).mainIncident as Awaited<
      ReturnType<typeof makeIncident>
    >;
    const created = (globalThis as Record<string, unknown>).mainCreated as { reportId: string };
    const incidentId = await moderationRepo.setStatus(sql, created.reportId, 'removed');
    expect(incidentId).toBe(incident.id);
    const rows = await reportsRepo.queryPublic(
      sql,
      incident.id,
      { west: -76.5, south: 44.5, east: -74.5, north: 46.5 },
      { statuses: [], fieldFilters: {} },
    );
    expect(rows.some((row) => row.id === created.reportId)).toBe(false);
    const removed = await moderationRepo.listQueue(sql, {
      incidentId: incident.id,
      statuses: ['removed'],
    });
    expect(removed.some((row) => row.id === created.reportId)).toBe(true);
  });

  it('filters public queries by schema field values', async () => {
    const incident = (globalThis as Record<string, unknown>).mainIncident as Awaited<
      ReturnType<typeof makeIncident>
    >;
    const withFlooding = await reportsService.createReport({
      reference: `${incident.slug}-${incident.publicId}`,
      latitude: 45.44,
      longitude: -75.66,
      privacy: 'exact',
      answers: { ...stormAnswers(), damage_type: 'flooding' },
      browserTokenCookie: null,
      ip: '203.0.113.14',
    });
    const filtered = await reportsRepo.queryPublic(
      sql,
      incident.id,
      { west: -76.5, south: 44.5, east: -74.5, north: 46.5 },
      { statuses: [], fieldFilters: { damage_type: ['flooding'] } },
    );
    expect(filtered.some((row) => row.id === withFlooding.reportId)).toBe(true);
    const treeOnly = await reportsRepo.queryPublic(
      sql,
      incident.id,
      { west: -76.5, south: 44.5, east: -74.5, north: 46.5 },
      { statuses: [], fieldFilters: { damage_type: ['tree_down'] } },
    );
    expect(treeOnly.some((row) => row.id === withFlooding.reportId)).toBe(false);
  });

  it('rate limits allow up to the limit then block', async () => {
    for (let i = 0; i < 3; i += 1) {
      const result = await rateLimitRepo.checkAndRecord(sql, 'test_route', 'subject_a', 3, 60);
      expect(result.allowed).toBe(true);
    }
    const blocked = await rateLimitRepo.checkAndRecord(sql, 'test_route', 'subject_a', 3, 60);
    expect(blocked.allowed).toBe(false);
  });

  it('caches geocode results', async () => {
    await geocodeCacheRepo.set(sql, 'arnprior', { results: [] }, 60);
    expect(await geocodeCacheRepo.get(sql, 'arnprior')).toEqual({ results: [] });
    expect(await geocodeCacheRepo.get(sql, 'unknown-key')).toBeNull();
    await geocodeCacheRepo.set(sql, 'expired', { results: [] }, -60);
    expect(await geocodeCacheRepo.get(sql, 'expired')).toBeNull();
  });

  it('records audit events for the pipeline', async () => {
    const incident = (globalThis as Record<string, unknown>).mainIncident as Awaited<
      ReturnType<typeof makeIncident>
    >;
    const events = await auditRepo.listForIncident(sql, incident.id);
    const types = events.map((event) => event.eventType);
    expect(types).toContain('report_created');
    expect(types).toContain('report_updated');
  });
});
