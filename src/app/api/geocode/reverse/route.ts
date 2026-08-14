import { NextRequest, NextResponse } from 'next/server';
import { handleApi } from '@/server/errors';
import { noStore } from '@/server/http';
import { reverseGeocode } from '@/server/services/geocode.service';

export const dynamic = 'force-dynamic';

export const GET = handleApi(async (request: NextRequest) => {
  const lat = Number(request.nextUrl.searchParams.get('lat'));
  const lon = Number(request.nextUrl.searchParams.get('lon'));
  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return NextResponse.json({ result: null }, { headers: noStore() });
  }
  const result = await reverseGeocode(lat, lon);
  return NextResponse.json({ result }, { headers: noStore() });
});
