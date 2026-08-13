import { z } from 'zod';
import type { GeocodeResult } from '@/shared/types';
import { getEnv } from '../env';
import { AppError } from '../errors';
import { logError } from '../log';
import { getSql } from '../db/client';
import * as geocodeCacheRepo from '../repos/geocode-cache.repo';

const UNAVAILABLE_MESSAGE =
  'Address search is temporarily unavailable. You can still place a pin on the map.';

const upstreamResultSchema = z.object({
  display_name: z.string().max(500),
  lat: z.string().regex(/^-?\d+(\.\d+)?$/),
  lon: z.string().regex(/^-?\d+(\.\d+)?$/),
  address: z
    .object({
      municipality: z.string().optional(),
      city: z.string().optional(),
      town: z.string().optional(),
      village: z.string().optional(),
      hamlet: z.string().optional(),
      province: z.string().optional(),
    })
    .optional(),
});
const upstreamResponseSchema = z.array(upstreamResultSchema).max(10);

export async function search(query: string): Promise<{ results: GeocodeResult[] }> {
  const normalized = query.trim().replace(/\s+/g, ' ');
  if (normalized.length < 3) return { results: [] };
  if (normalized.length > 200) throw AppError.badRequest('Query is too long');

  const db = getSql();
  const key = normalized.toLowerCase();
  const cached = await geocodeCacheRepo.get(db, key);
  if (cached) return cached as { results: GeocodeResult[] };

  const url = new URL(getEnv().NOMINATIM_SEARCH_URL);
  url.search = new URLSearchParams({
    q: normalized,
    format: 'jsonv2',
    addressdetails: '1',
    countrycodes: 'ca',
    limit: '6',
  }).toString();

  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(4_000),
      headers: {
        Accept: 'application/json',
        'User-Agent': 'ImpactSystem/0.2 (community incident mapping)',
      },
      cache: 'no-store',
    });
  } catch (error) {
    logError('geocode_upstream_unreachable', error);
    throw AppError.serverUnavailable(UNAVAILABLE_MESSAGE);
  }
  if (!response.ok) {
    logError('geocode_upstream_error', new Error(`HTTP ${response.status}`));
    throw AppError.serverUnavailable(UNAVAILABLE_MESSAGE);
  }
  const parsed = upstreamResponseSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) {
    logError('geocode_upstream_malformed', new Error('Invalid upstream response'));
    throw AppError.serverUnavailable(UNAVAILABLE_MESSAGE);
  }

  const value: { results: GeocodeResult[] } = {
    results: parsed.data.map((item) => ({
      label: item.display_name,
      latitude: Number(item.lat),
      longitude: Number(item.lon),
      placeLabel:
        item.address?.municipality ??
        item.address?.city ??
        item.address?.town ??
        item.address?.village ??
        item.address?.hamlet ??
        undefined,
    })),
  };
  await geocodeCacheRepo.set(db, key, value, 86_400);
  return value;
}
