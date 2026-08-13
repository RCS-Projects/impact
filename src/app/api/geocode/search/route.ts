import { NextRequest, NextResponse } from 'next/server';
import { handleApi } from '@/server/errors';
import { clientIp } from '@/server/http';
import { hmacIp } from '@/server/security/hashing';
import * as rateLimit from '@/server/services/rate-limit.service';
import * as geocode from '@/server/services/geocode.service';

export const dynamic = 'force-dynamic';

export const GET = handleApi(async (request: NextRequest) => {
  const query = request.nextUrl.searchParams.get('q') ?? '';
  await rateLimit.enforce('geocode_search', hmacIp(clientIp(request)), 30, 60);
  const results = await geocode.search(query);
  return NextResponse.json(results, {
    headers: { 'Cache-Control': 'private, max-age=60' },
  });
});
