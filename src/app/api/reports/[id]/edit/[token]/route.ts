import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSql } from '@/lib/db';
import { validateAnswers, incidentFormSchema } from '@/lib/form-schema';
import { approximatePoint, PRIVACY_RADIUS_METERS, verifyEditToken } from '@/lib/security';

const input = z.object({
  answers: z.unknown(),
  privacy: z.enum(['exact', 'approximate']),
  latitude: z.number().min(41).max(84),
  longitude: z.number().min(-142).max(-52),
  confirmExact: z.boolean().optional(),
});
export async function GET(_: NextRequest, { params }: { params: { id: string; token: string } }) {
  const rows = await getSql()<
    {
      answers: unknown;
      locationPrivacy: string;
      latitude: number;
      longitude: number;
      editTokenHash: string;
      formSchema: unknown;
    }[]
  >`SELECT r.answers, r.location_privacy AS "locationPrivacy", ST_Y(p.submitted_coordinate::geometry) AS latitude, ST_X(p.submitted_coordinate::geometry) AS longitude, r.edit_token_hash AS "editTokenHash", r.schema_snapshot AS "formSchema" FROM reports r JOIN report_private_locations p ON p.report_id = r.id WHERE r.id = ${params.id} LIMIT 1`;
  const report = rows[0];
  if (!report || !(await verifyEditToken(params.token, report.editTokenHash)))
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(
    {
      answers: report.answers,
      privacy: report.locationPrivacy,
      latitude: report.latitude,
      longitude: report.longitude,
      schema: report.formSchema,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string; token: string } },
) {
  const data = input.safeParse(await request.json().catch(() => null));
  if (!data.success) return NextResponse.json({ error: 'Invalid update' }, { status: 400 });
  const sql = getSql();
  const rows = await sql<
    {
      incidentId: string;
      editTokenHash: string;
      formSchema: unknown;
      oldPrivacy: string;
      hasArea: boolean;
    }[]
  >`SELECT r.incident_id AS "incidentId", r.edit_token_hash AS "editTokenHash", r.schema_snapshot AS "formSchema", r.location_privacy AS "oldPrivacy", i.reporting_area IS NOT NULL AS "hasArea" FROM reports r JOIN incidents i ON i.id = r.incident_id WHERE r.id = ${params.id} LIMIT 1`;
  const report = rows[0];
  if (!report || !(await verifyEditToken(params.token, report.editTokenHash)))
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (
    report.oldPrivacy === 'approximate' &&
    data.data.privacy === 'exact' &&
    !data.data.confirmExact
  )
    return NextResponse.json(
      { error: 'Explicit confirmation is required before publishing an exact location' },
      { status: 409 },
    );
  let answers;
  try {
    answers = validateAnswers(incidentFormSchema.parse(report.formSchema), data.data.answers);
  } catch {
    return NextResponse.json({ error: 'Invalid report form' }, { status: 400 });
  }
  const point = `SRID=4326;POINT(${data.data.longitude} ${data.data.latitude})`;
  const allowed = await sql<
    { allowed: boolean }[]
  >`SELECT reporting_area IS NULL OR ST_Covers(reporting_area, ST_GeogFromText(${point})) AS allowed FROM incidents WHERE id = ${report.incidentId}`;
  if (!allowed[0]?.allowed)
    return NextResponse.json(
      { error: 'That location is outside this incident’s reporting area.' },
      { status: 422 },
    );
  const publicPoint =
    data.data.privacy === 'approximate'
      ? approximatePoint(data.data.latitude, data.data.longitude)
      : data.data;
  await sql.begin(async (tx) => {
    await tx`UPDATE reports SET answers = ${tx.json(answers as never)}, location_privacy = ${data.data.privacy}, public_coordinate = ST_GeogFromText(${'SRID=4326;POINT(' + publicPoint.longitude + ' ' + publicPoint.latitude + ')'}), privacy_radius_meters = ${data.data.privacy === 'approximate' ? PRIVACY_RADIUS_METERS : null}, updated_at = now() WHERE id = ${params.id}`;
    await tx`UPDATE report_private_locations SET submitted_coordinate = ST_GeogFromText(${point}), updated_at = now() WHERE report_id = ${params.id}`;
    await tx`INSERT INTO audit_events (incident_id, report_id, actor_type, event_type) VALUES (${report.incidentId}, ${params.id}, 'public', 'report_updated')`;
  });
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
