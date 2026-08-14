import { NextRequest, NextResponse } from 'next/server';
import { handleApi } from '@/server/errors';
import { getSql } from '@/server/db/client';
import { noStore } from '@/server/http';
import { requireAdminRole } from '@/server/services/auth.service';
import * as incidentsRepo from '@/server/repos/incidents.repo';

export const dynamic = 'force-dynamic';

export const GET = handleApi(
  async (request: NextRequest, { params }: { params: { id: string } }) => {
    await requireAdminRole(request);
    const db = getSql();
    const incident = await incidentsRepo.findByIdForAdmin(db, params.id);
    if (!incident) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const format = request.nextUrl.searchParams.get('format') ?? 'json';
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
      }[]
    >`
      SELECT r.id, r.answers, r.public_place_label AS "placeLabel",
        r.location_privacy::text AS privacy,
        ST_X(r.public_coordinate::geometry) AS longitude,
        ST_Y(r.public_coordinate::geometry) AS latitude,
        r.status::text AS status, r.created_at::text AS "createdAt"
      FROM reports r
      WHERE r.incident_id = ${params.id}
      ORDER BY r.created_at DESC
    `;

    if (format === 'csv') {
      const allKeys = new Set<string>();
      for (const row of rows) {
        for (const key of Object.keys(row.answers)) allKeys.add(key);
      }
      const answerKeys = [...allKeys].sort();
      const header = ['id', 'status', 'createdAt', 'latitude', 'longitude', 'privacy', 'placeLabel', ...answerKeys];
      const csvRows = rows.map((row) => {
        const base = [
          row.id,
          row.status,
          row.createdAt,
          String(row.latitude),
          String(row.longitude),
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
      const csv = [header, ...csvRows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${incident.slug}-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    return NextResponse.json(
      { incident: { title: incident.title, slug: incident.slug, status: incident.status }, reports: rows },
      {
        headers: {
          'Content-Disposition': `attachment; filename="${incident.slug}-${new Date().toISOString().slice(0, 10)}.json"`,
        },
      },
    );
  },
);
