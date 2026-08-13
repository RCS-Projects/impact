import type { NextRequest } from 'next/server';

export function clientIp(request: NextRequest): string {
  return (
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  );
}

export function noStore() {
  return { 'Cache-Control': 'no-store' };
}
