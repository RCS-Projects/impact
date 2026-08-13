import { getEnv, runtimeMode } from '../env';
import { AppError } from '../errors';
import { log, logError } from '../log';
import * as rateLimit from './rate-limit.service';

export interface CaptchaResult {
  ok: boolean;
  bypassed: boolean;
}

export async function verifyTurnstile(
  token: string | undefined,
  ipHash: string,
): Promise<CaptchaResult> {
  const env = getEnv();
  if (runtimeMode() !== 'production' && env.DEVELOPMENT_TURNSTILE_BYPASS === 'true')
    return { ok: true, bypassed: true };
  if (!env.TURNSTILE_SITE_KEY || !env.TURNSTILE_SECRET_KEY) {
    logError('turnstile_misconfigured', new Error('Turnstile keys missing in production'));
    throw AppError.serverUnavailable(
      'CAPTCHA verification is unavailable. Please try again later.',
    );
  }
  if (!token) return { ok: false, bypassed: false };
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token }),
      signal: AbortSignal.timeout(5_000),
    });
    const body = (await response.json().catch(() => null)) as { success?: boolean } | null;
    const ok = response.ok && body?.success === true;
    if (!ok) log('captcha_verification_failed', { ipHash });
    return { ok, bypassed: false };
  } catch (error) {
    logError('turnstile_verify_error', error, { ipHash });
    return { ok: false, bypassed: false };
  }
}

export function recordFailure(ipHash: string) {
  return rateLimit.recordEvent('captcha_fail', ipHash);
}

export function failureCount(ipHash: string) {
  return rateLimit.countRecent('captcha_fail', ipHash, 3_600);
}
