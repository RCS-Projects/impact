import { z } from 'zod';

const production = process.env.NODE_ENV === 'production';
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url(),
  APP_URL: z.string().url(),
  SESSION_SECRET: z.string().min(32),
  IP_HASH_SECRET: z.string().min(32),
  ADMIN_BOOTSTRAP_EMAIL: z.string().email().optional(),
  ADMIN_BOOTSTRAP_SECRET: z.string().min(32).optional(),
  NOMINATIM_SEARCH_URL: z.string().url(),
  TURNSTILE_SITE_KEY: z.string().optional(),
  TURNSTILE_SECRET_KEY: z.string().optional(),
  DEVELOPMENT_TURNSTILE_BYPASS: z.enum(['true', 'false']).default('false'),
});

export function getEnv() {
  const env = schema.parse(process.env);
  if (production && env.DEVELOPMENT_TURNSTILE_BYPASS === 'true')
    throw new Error('Development Turnstile bypass is forbidden in production');
  return env;
}

export function requireTurnstileConfiguration() {
  const env = getEnv();
  if (production && (!env.TURNSTILE_SITE_KEY || !env.TURNSTILE_SECRET_KEY))
    throw new Error('Turnstile keys are required in production for public reports');
  return env;
}
