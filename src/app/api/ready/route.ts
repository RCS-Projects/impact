import { NextResponse } from 'next/server';
import { getSql } from '@/server/db/client';

export async function GET() {
  try {
    await getSql()`SELECT 1`;
    return NextResponse.json({ ready: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json(
      { ready: false },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
