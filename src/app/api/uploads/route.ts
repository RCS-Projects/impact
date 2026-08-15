import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { handleApi } from '@/server/errors';
import { getSql } from '@/server/db/client';
import { noStore } from '@/server/http';
import { AppError } from '@/server/errors';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { hashBrowserToken, hmacIp } from '@/server/security/hashing';
import * as rateLimit from '@/server/services/rate-limit.service';
import { newOpaqueToken } from '@/server/security/tokens';
import { isProduction } from '@/server/env';
import * as uploadsRepo from '@/server/repos/uploads.repo';
import { sanitizeImage } from '@/server/lib/image-metadata';

export const dynamic = 'force-dynamic';

const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const UPLOAD_CLAIM_COOKIE = 'impact_upload_claim';

function getUploadDir(): string {
  return process.env.UPLOAD_DIR ?? join(process.cwd(), 'data', 'uploads');
}

export const POST = handleApi(async (request: NextRequest) => {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1';
  const ipHash = hmacIp(ip);
  await rateLimit.enforce('photo_upload', ipHash, 10, 3_600);

  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('multipart/form-data')) {
    throw AppError.badRequest('Expected multipart/form-data');
  }
  const formData = await request.formData();
  const file = formData.get('file');
  if (!file || !(file instanceof File)) {
    throw AppError.badRequest('No file provided');
  }
  if (file.size > MAX_SIZE) {
    throw AppError.badRequest('File must be under 5MB');
  }

  const inputBuffer = Buffer.from(await file.arrayBuffer());
  const claimToken = (await cookies()).get(UPLOAD_CLAIM_COOKIE)?.value ?? newOpaqueToken();
  const claimHash = hashBrowserToken(claimToken);
  let sanitized;
  try {
    sanitized = await sanitizeImage(inputBuffer);
  } catch {
    throw AppError.badRequest('The uploaded file is not a valid supported image');
  }
  const filename = `${newOpaqueToken()}${sanitized.extension}`;
  const uploadDir = getUploadDir();
  await mkdir(uploadDir, { recursive: true });
  const filePath = join(uploadDir, filename);
  await writeFile(filePath, sanitized.buffer, { flag: 'wx' });
  try {
    const db = getSql();
    const id = await uploadsRepo.insert(db, {
      filename,
      originalName: file.name.slice(0, 255),
      mimeType: sanitized.mimeType,
      sizeBytes: sanitized.buffer.length,
      width: sanitized.width,
      height: sanitized.height,
      claimHash,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    if (!id) throw new Error('Upload insert failed');
    const response = NextResponse.json(
      { id, width: sanitized.width, height: sanitized.height },
      { status: 201, headers: noStore() },
    );
    response.cookies.set(UPLOAD_CLAIM_COOKIE, claimToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction(),
      maxAge: 60 * 60,
      path: '/',
    });
    return response;
  } catch (error) {
    await import('fs/promises').then(({ unlink }) => unlink(filePath)).catch(() => undefined);
    throw error;
  }
});
