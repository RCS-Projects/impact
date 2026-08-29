import { NextRequest, NextResponse } from 'next/server';
import { AppError } from '@/server/app-error';
import { handleApi } from '@/server/errors';
import { getSql } from '@/server/db/client';
import { noStore } from '@/server/http';
import { requireAdmin } from '@/server/services/auth.service';
import * as incidentsRepo from '@/server/repos/incidents.repo';
import * as auditRepo from '@/server/repos/audit.repo';

export const dynamic = 'force-dynamic';

export const GET = handleApi(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    // This is a read-only download. Authentication and role checks are required,
    // but CSRF is intentionally limited to state-changing admin requests.
    const admin = await requireAdmin();
    if (admin.role !== 'admin') throw AppError.forbidden('Administrators only');
    const db = getSql();
    const incident = await incidentsRepo.findByIdForAdmin(db, id);
    if (!incident) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const format = request.nextUrl.searchParams.get('format') ?? 'json';
    const sensitive = request.nextUrl.searchParams.get('sensitive') === 'true';
    if (sensitive && request.headers.get('x-sensitive-export-confirm') !== 'yes') {
      return NextResponse.json(
        { error: 'Explicit confirmation is required for sensitive exports' },
        { status: 400, headers: noStore() },
      );
    }
    const rows = await db<
      {
        id: string;
        answers: Record<string, unknown>;
        placeLabel: string | null;
        privacy: string;
        longitude: number;
        latitude: number;
        status: string;
        createdAt: string;
        geometryType: string;
        geometry: unknown;
        exactLongitude?: number | null;
        exactLatitude?: number | null;
      }[]
    >`
      SELECT r.id, r.answers, r.public_place_label AS "placeLabel",
        r.location_privacy::text AS privacy,
        ST_X(r.public_coordinate::geometry) AS longitude,
        ST_Y(r.public_coordinate::geometry) AS latitude,
        r.status::text AS status, r.created_at::text AS "createdAt",
        COALESCE(ST_GeometryType(r.report_geometry::geometry), 'ST_Point') AS "geometryType",
        ST_AsGeoJSON(r.report_geometry::geometry)::jsonb AS geometry,
        ${sensitive ? db`ST_X(p.submitted_coordinate::geometry)` : db`NULL`} AS "exactLongitude",
        ${sensitive ? db`ST_Y(p.submitted_coordinate::geometry)` : db`NULL`} AS "exactLatitude"
      FROM reports r
      ${sensitive ? db`JOIN report_private_locations p ON p.report_id = r.id` : db``}
      WHERE r.incident_id = ${id}
      ORDER BY r.created_at DESC
    `;

    if (sensitive) {
      await auditRepo.record(db, {
        incidentId: id,
        actorType: 'admin',
        actorId: admin.id,
        eventType: 'sensitive_export_downloaded',
        metadata: { format, rowCount: rows.length },
      });
    }

    if (format === 'csv') {
      const allKeys = new Set<string>();
      for (const row of rows) {
        for (const key of Object.keys(row.answers)) allKeys.add(key);
      }
      const answerKeys = [...allKeys].sort();
      const header = [
        'id',
        'status',
        'createdAt',
        'geometryType',
        'geometry',
        'latitude',
        'longitude',
        ...(sensitive ? ['exactLatitude', 'exactLongitude'] : []),
        'privacy',
        'placeLabel',
        ...answerKeys,
      ];
      const csvRows = rows.map((row) => {
        const base = [
          row.id,
          row.status,
          row.createdAt,
          row.geometryType.replace(/^ST_/, ''),
          JSON.stringify(row.geometry ?? ''),
          String(row.latitude),
          String(row.longitude),
          ...(sensitive ? [String(row.exactLatitude ?? ''), String(row.exactLongitude ?? '')] : []),
          row.privacy,
          row.placeLabel ?? '',
        ];
        const answers = answerKeys.map((key) => {
          const val = row.answers[key];
          if (val === undefined || val === null) return '';
          if (typeof val === 'boolean') return val ? 'true' : 'false';
          if (Array.isArray(val)) return val.join('; ');
          if (typeof val === 'object') return JSON.stringify(val);
          return String(val);
        });
        return [...base, ...answers];
      });
      const csv = [header, ...csvRows]
        .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
        .join('\n');
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          ...noStore(),
          'Content-Disposition': `attachment; filename="${incident.slug}-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    return NextResponse.json(
      {
        incident: { title: incident.title, slug: incident.slug, status: incident.status },
        reports: rows,
      },
      {
        headers: {
          ...noStore(),
          'Content-Disposition': `attachment; filename="${incident.slug}-${new Date().toISOString().slice(0, 10)}.json"`,
        },
      },
    );
  },
);
