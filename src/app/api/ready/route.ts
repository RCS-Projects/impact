import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';

export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    await getSql()`SELECT 1`;
    return NextResponse.json({ status: 'ready' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json(
      { status: 'not_ready' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
