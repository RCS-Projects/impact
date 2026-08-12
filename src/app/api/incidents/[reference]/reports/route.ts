import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { findPublicIncident } from '@/lib/incidents';
import { incidentFormSchema, validateAnswers } from '@/lib/form-schema';
import {
  approximatePoint,
  hashBrowserToken,
  hashEditToken,
  hmacIp,
  newOpaqueToken,
  PRIVACY_RADIUS_METERS,
} from '@/lib/security';
import { getSql } from '@/lib/db';
import { getEnv, requireTurnstileConfiguration } from '@/lib/env';

const inputSchema = z.object({
  latitude: z.number().min(41).max(84),
  longitude: z.number().min(-142).max(-52),
  privacy: z.enum(['exact', 'approximate']),
  answers: z.unknown(),
  placeLabel: z.string().max(120).optional(),
  turnstileToken: z.string().max(4096).optional(),
});

async function verifyCaptcha(token: string | undefined) {
  const env = requireTurnstileConfiguration();
  if (env.IMPACT_RUNTIME_MODE === 'development' && env.DEVELOPMENT_TURNSTILE_BYPASS === 'true')
    return true;
  if (!token || !env.TURNSTILE_SECRET_KEY) return false;
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token }),
    signal: AbortSignal.timeout(5_000),
  });
  const body = (await response.json().catch(() => null)) as { success?: boolean } | null;
  return response.ok && body?.success === true;
}

export async function POST(request: NextRequest, { params }: { params: { reference: string } }) {
  const incident = await findPublicIncident(params.reference);
  if (!incident) return NextResponse.json({ error: 'Incident not found' }, { status: 404 });
  if (incident.status !== 'live')
    return NextResponse.json({ error: 'This incident is closed' }, { status: 409 });
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: 'Invalid report submission' }, { status: 400 });
  if (!(await verifyCaptcha(parsed.data.turnstileToken)))
    return NextResponse.json({ error: 'CAPTCHA verification failed' }, { status: 400 });
  let answers: Record<string, unknown>;
  try {
    answers = validateAnswers(incidentFormSchema.parse(incident.formSchema), parsed.data.answers);
  } catch {
    return NextResponse.json({ error: 'Invalid report form' }, { status: 400 });
  }
  const sql = getSql();
  const point = `SRID=4326;POINT(${parsed.data.longitude} ${parsed.data.latitude})`;
  const allowed = await sql<
    { allowed: boolean }[]
  >`SELECT reporting_area IS NULL OR ST_Covers(reporting_area, ST_GeogFromText(${point})) AS allowed FROM incidents WHERE id = ${incident.id}`;
  if (!allowed[0]?.allowed)
    return NextResponse.json(
      { error: 'That location is outside this incident’s reporting area.' },
      { status: 422 },
    );
  const browserToken = cookies().get('impact_browser_token')?.value ?? newOpaqueToken();
  const ip =
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown';
  const browserHash = hashBrowserToken(browserToken);
  const ipHash = hmacIp(ip);
  const editToken = newOpaqueToken();
  const publicPoint =
    parsed.data.privacy === 'approximate'
      ? approximatePoint(parsed.data.latitude, parsed.data.longitude)
      : { latitude: parsed.data.latitude, longitude: parsed.data.longitude };
  try {
    const rows = await sql.begin(async (tx) => {
      const reports = await tx<{ id: string }[]>`
        INSERT INTO reports (incident_id, schema_snapshot, answers, public_place_label, location_privacy, public_coordinate, privacy_radius_meters, browser_token_hash, ip_hash, edit_token_hash)
        VALUES (${incident.id}, ${tx.json(incident.formSchema as never)}, ${tx.json(answers as never)}, ${parsed.data.placeLabel ?? null}, ${parsed.data.privacy}, ST_GeogFromText(${'SRID=4326;POINT(' + publicPoint.longitude + ' ' + publicPoint.latitude + ')'}), ${parsed.data.privacy === 'approximate' ? PRIVACY_RADIUS_METERS : null}, ${browserHash}, ${ipHash}, ${await hashEditToken(editToken)}) RETURNING id
      `;
      await tx`INSERT INTO report_private_locations (report_id, submitted_coordinate) VALUES (${reports[0].id}, ST_GeogFromText(${point}))`;
      await tx`INSERT INTO audit_events (incident_id, report_id, actor_type, event_type) VALUES (${incident.id}, ${reports[0].id}, 'public', 'report_created')`;
      return reports;
    });
    const response = NextResponse.json(
      { editUrl: `/report/edit/${rows[0].id}/${editToken}`, reportId: rows[0].id },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    );
    response.cookies.set('impact_browser_token', browserToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: getEnv().IMPACT_RUNTIME_MODE === 'production',
      maxAge: 60 * 60 * 24 * 365,
      path: '/',
    });
    return response;
  } catch (error) {
    if ((error as { code?: string }).code === '23505')
      return NextResponse.json(
        {
          error:
            'A report already exists for this browser on this incident. Use your private edit link to update it.',
        },
        { status: 409 },
      );
    console.error(JSON.stringify({ event: 'report_create_failed', incidentId: incident.id }));
    return NextResponse.json({ error: 'Could not save report' }, { status: 500 });
  }
}

export async function GET(request: NextRequest, { params }: { params: { reference: string } }) {
  const incident = await findPublicIncident(params.reference);
  if (!incident) return NextResponse.json({ error: 'Incident not found' }, { status: 404 });
  const bounds = z
    .object({
      west: z.coerce.number().min(-142).max(-52),
      south: z.coerce.number().min(41).max(84),
      east: z.coerce.number().min(-142).max(-52),
      north: z.coerce.number().min(41).max(84),
    })
    .safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (
    !bounds.success ||
    bounds.data.west > bounds.data.east ||
    bounds.data.south > bounds.data.north
  )
    return NextResponse.json({ error: 'Valid map bounds are required' }, { status: 400 });
  const b = bounds.data;
  const reports = await getSql()<
    {
      id: string;
      answers: unknown;
      placeLabel: string | null;
      privacy: string;
      longitude: number;
      latitude: number;
      radius: number | null;
      status: string;
      createdAt: string;
    }[]
  >`
    SELECT id, answers, public_place_label AS "placeLabel", location_privacy AS privacy, ST_X(public_coordinate::geometry) AS longitude, ST_Y(public_coordinate::geometry) AS latitude, privacy_radius_meters::float AS radius, moderation_status AS status, created_at::text AS "createdAt"
    FROM reports WHERE incident_id = ${incident.id} AND moderation_status IN ('unverified', 'approved', 'resolved') AND public_coordinate && ST_MakeEnvelope(${b.west}, ${b.south}, ${b.east}, ${b.north}, 4326)::geography ORDER BY created_at DESC LIMIT 500
  `;
  return NextResponse.json(
    { reports },
    { headers: { 'Cache-Control': 'public, max-age=20, stale-while-revalidate=40' } },
  );
}
