import { NextResponse } from 'next/server';

export function GET() {
  return NextResponse.json(
    { ok: true, service: 'impact-system' },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
