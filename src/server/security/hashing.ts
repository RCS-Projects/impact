import crypto from 'node:crypto';
import { getEnv } from '../env';

export function hmacIp(ip: string): string {
  return crypto.createHmac('sha256', getEnv().IP_HASH_SECRET).update(ip).digest('hex');
}

export function hashBrowserToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function hashSubject(...parts: string[]): string {
  return crypto.createHash('sha256').update(parts.join('|')).digest('hex');
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort())
      out[key] = canonicalize((value as Record<string, unknown>)[key]);
    return out;
  }
  return value;
}

export function hashContent(value: unknown): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex');
}

export function timingSafeEqualString(a: string, b: string): boolean {
  const left = crypto.createHash('sha256').update(a).digest();
  const right = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(left, right);
}
