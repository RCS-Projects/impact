import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getEnv } from '@/lib/env';

export const dynamic = 'force-dynamic';
const resultSchema = z.object({
  display_name: z.string().max(500),
  lat: z.string().regex(/^-?\d+(\.\d+)?$/),
  lon: z.string().regex(/^-?\d+(\.\d+)?$/),
  address: z
    .object({
      municipality: z.string().optional(),
      city: z.string().optional(),
      town: z.string().optional(),
      village: z.string().optional(),
      province: z.string().optional(),
    })
    .optional(),
});
const responseSchema = z.array(resultSchema).max(10);
const cache = new Map<string, { expiresAt: number; value: unknown }>();
const requests = new Map<string, number[]>();

function rateLimited(request: NextRequest) {
  const subject =
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0] ??
    'unknown';
  const now = Date.now();
  const previous = (requests.get(subject) ?? []).filter((time) => time > now - 60_000);
  previous.push(now);
  requests.set(subject, previous);
  return previous.length > 30;
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')?.trim().replace(/\s+/g, ' ') ?? '';
  if (query.length < 3)
    return NextResponse.json(
      { results: [] },
      { headers: { 'Cache-Control': 'private, max-age=30' } },
    );
  if (query.length > 200) return NextResponse.json({ error: 'Query is too long' }, { status: 400 });
  if (rateLimited(request))
    return NextResponse.json(
      { error: 'Too many search requests' },
      { status: 429, headers: { 'Retry-After': '60' } },
    );
  const key = query.toLowerCase();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now())
    return NextResponse.json(cached.value, {
      headers: { 'Cache-Control': 'private, max-age=300' },
    });
  const url = new URL(getEnv().NOMINATIM_SEARCH_URL);
  url.search = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    addressdetails: '1',
    countrycodes: 'ca',
    limit: '6',
  }).toString();
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(4_000),
      headers: {
        Accept: 'application/json',
        'User-Agent': 'ImpactSystem/0.1 (local community incident mapping)',
      },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error('upstream unavailable');
    const parsed = responseSchema.safeParse(await response.json());
    if (!parsed.success) throw new Error('invalid upstream response');
    const value = {
      results: parsed.data.map((item) => ({
        label: item.display_name,
        latitude: Number(item.lat),
        longitude: Number(item.lon),
        placeLabel:
          item.address?.municipality ??
          item.address?.city ??
          item.address?.town ??
          item.address?.village ??
          undefined,
      })),
    };
    cache.set(key, { value, expiresAt: Date.now() + 300_000 });
    return NextResponse.json(value, { headers: { 'Cache-Control': 'private, max-age=300' } });
  } catch {
    return NextResponse.json(
      { error: 'Address search is temporarily unavailable. You can still place a pin on the map.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
