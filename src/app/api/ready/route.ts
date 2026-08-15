import { NextResponse } from 'next/server';
import { getSql } from '@/server/db/client';
import { access, mkdir, constants } from 'node:fs/promises';
import path from 'node:path';

export async function GET() {
  try {
    await getSql()`SELECT 1`;
    const uploadDir = process.env.UPLOAD_DIR ?? path.join(process.cwd(), 'data', 'uploads');
    await mkdir(uploadDir, { recursive: true });
    await access(uploadDir, constants.W_OK);
    return NextResponse.json({ ready: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json(
      { ready: false },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
