import { NextRequest, NextResponse } from 'next/server';
import { handleApi } from '@/server/errors';
import { getSql } from '@/server/db/client';
import { noStore } from '@/server/http';
import { requireAdmin } from '@/server/services/auth.service';
import { AppError } from '@/server/errors';
import { nanoid } from 'nanoid';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

export const dynamic = 'force-dynamic';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

function getUploadDir(): string {
  return process.env.UPLOAD_DIR ?? join(process.cwd(), 'data', 'uploads');
}

export const POST = handleApi(async (request: NextRequest) => {
  await requireAdmin();
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('multipart/form-data')) {
    throw AppError.badRequest('Expected multipart/form-data');
  }
  const formData = await request.formData();
  const file = formData.get('file');
  if (!file || !(file instanceof File)) {
    throw AppError.badRequest('No file provided');
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    throw AppError.badRequest('Only JPEG, PNG, and WebP images are allowed');
  }
  if (file.size > MAX_SIZE) {
    throw AppError.badRequest('File must be under 10MB');
  }

  const ext = file.type === 'image/jpeg' ? '.jpg' : file.type === 'image/webp' ? '.webp' : '.png';
  const filename = `${nanoid(16)}${ext}`;
  const uploadDir = getUploadDir();
  await mkdir(uploadDir, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(join(uploadDir, filename), buffer);

  const db = getSql();
  const result = await db<{ id: string }[]>`
    INSERT INTO uploads (filename, original_name, mime_type, size_bytes)
    VALUES (${filename}, ${file.name}, ${file.type}, ${file.size})
    RETURNING id
  `.then((rows) => rows[0]);

  return NextResponse.json(
    { id: result?.id, url: `/api/uploads/files/${filename}`, filename },
    { status: 201, headers: noStore() },
  );
});
