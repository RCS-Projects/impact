import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  IMPACT_RUNTIME_MODE: z.enum(['development', 'test', 'production']).optional(),
  DATABASE_URL: z.string().min(1),
  APP_URL: z.string().url(),
  SESSION_SECRET: z.string().min(32),
  IP_HASH_SECRET: z.string().min(32),
  ADMIN_BOOTSTRAP_EMAIL: z.string().email().optional().or(z.literal('')),
  ADMIN_BOOTSTRAP_SECRET: z.string().min(32).optional().or(z.literal('')),
  NOMINATIM_SEARCH_URL: z.string().url(),
  TURNSTILE_SITE_KEY: z.string().optional().or(z.literal('')),
  TURNSTILE_SECRET_KEY: z.string().optional().or(z.literal('')),
  DEVELOPMENT_TURNSTILE_BYPASS: z.enum(['true', 'false']).default('false'),
  UPLOAD_DIR: z.string().optional(),
  DEFAULT_MAP_LATITUDE: z.coerce.number().min(41).max(84).default(45.4215),
  DEFAULT_MAP_LONGITUDE: z.coerce.number().min(-142).max(-52).default(-75.6972),
  DEFAULT_MAP_ZOOM: z.coerce.number().min(3).max(18).default(10),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const env = schema.parse(process.env);
  if (runtimeModeOf(env) === 'production') {
    if (env.DEVELOPMENT_TURNSTILE_BYPASS === 'true')
      throw new Error('Development Turnstile bypass is forbidden in production');
    if (!env.TURNSTILE_SITE_KEY || !env.TURNSTILE_SECRET_KEY)
      throw new Error('Production requires real Turnstile site and secret keys');
  }
  cached = env;
  return env;
}

export function runtimeModeOf(env: Env): 'development' | 'test' | 'production' {
  return env.IMPACT_RUNTIME_MODE ?? env.NODE_ENV;
}

export function runtimeMode(): 'development' | 'test' | 'production' {
  return runtimeModeOf(getEnv());
}

export function isProduction(): boolean {
  return runtimeMode() === 'production';
}

export function defaultMapCenter() {
  const env = getEnv();
  return {
    latitude: env.DEFAULT_MAP_LATITUDE,
    longitude: env.DEFAULT_MAP_LONGITUDE,
    zoom: env.DEFAULT_MAP_ZOOM,
  };
}
