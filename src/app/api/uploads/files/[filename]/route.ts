import { NextRequest, NextResponse } from 'next/server';
import { handleApi } from '@/server/errors';
import { readFile } from 'fs/promises';
import { join } from 'path';

export const dynamic = 'force-dynamic';

function getUploadDir(): string {
  return process.env.UPLOAD_DIR ?? join(process.cwd(), 'data', 'uploads');
}

const MIME_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

export const GET = handleApi(
  async (_request: NextRequest, { params }: { params: { filename: string } }) => {
    const filename = params.filename;
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
    }
    const ext = '.' + filename.split('.').pop()?.toLowerCase();
    const mime = MIME_MAP[ext] ?? 'application/octet-stream';
    const filePath = join(getUploadDir(), filename);
    try {
      const buffer = await readFile(filePath);
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': mime,
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    } catch {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
  },
);
