import { getSql } from '../db/client';
import { AppError } from '../errors';
import * as rateLimitRepo from '../repos/rate-limit.repo';

export async function enforce(
  route: string,
  subjectHash: string,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  const result = await rateLimitRepo.checkAndRecord(
    getSql(),
    route,
    subjectHash,
    limit,
    windowSeconds,
  );
  if (!result.allowed) throw AppError.rateLimited(result.retryAfterSeconds);
}

export function recordEvent(route: string, subjectHash: string) {
  return rateLimitRepo.recordEvent(getSql(), route, subjectHash);
}

export function countRecent(route: string, subjectHash: string, windowSeconds: number) {
  return rateLimitRepo.countRecent(getSql(), route, subjectHash, windowSeconds);
}
