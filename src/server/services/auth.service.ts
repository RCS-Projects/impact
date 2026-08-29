import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { getEnv, isProduction } from '../env';
import { AppError } from '../errors';
import { getSql } from '../db/client';
import { log } from '../log';
import * as adminsRepo from '../repos/admins.repo';
import * as auditRepo from '../repos/audit.repo';
import { hashSubject, timingSafeEqualString } from '../security/hashing';
import { hashPassword, newCsrfToken, verifyPassword } from '../security/tokens';
import * as rateLimit from './rate-limit.service';

export const SESSION_COOKIE = 'impact_admin_session';
export const CSRF_COOKIE = 'impact_csrf';
export const CSRF_HEADER = 'x-csrf-token';

export interface AdminSession {
  id: string;
  email: string;
  role: 'admin' | 'moderator';
  csrf: string;
}

function signingKey() {
  return new TextEncoder().encode(getEnv().SESSION_SECRET);
}

export async function login(
  loginName: string,
  password: string,
  ipHash: string,
): Promise<{ jwt: string; csrf: string; admin: AdminSession }> {
  const db = getSql();
  const loginKey = loginName.trim().toLowerCase();
  const isTestMode = process.env.IMPACT_RUNTIME_MODE === 'test';
  await rateLimit.enforce(
    'admin_login',
    hashSubject('admin_login', ipHash, loginKey),
    isTestMode ? 1_000 : 10,
    900,
  );
  const admin = await adminsRepo.findByLogin(db, loginKey);
  const passwordOk = admin
    ? await verifyPassword(password, admin.passwordHash)
    : (await verifyPassword(password, await getDummyHash())) && false;
  if (!admin || !passwordOk) {
    log('admin_login_failed', { login: loginKey });
    throw AppError.unauthorized('Invalid login or password');
  }
  await adminsRepo.touchLogin(db, admin.id);
  const csrf = newCsrfToken();
  const jwt = await new SignJWT({ email: admin.email, role: admin.role, csrf })
    .setSubject(admin.id)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(signingKey());
  await auditRepo.record(db, {
    actorType: 'admin',
    actorId: admin.id,
    eventType: 'admin_login',
  });
  const session = { id: admin.id, email: admin.email, role: admin.role, csrf };
  return { jwt, csrf, admin: session };
}

let dummyHashPromise: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  if (!dummyHashPromise) dummyHashPromise = hashPassword('timing-equalizer-not-a-password');
  return dummyHashPromise;
}

export async function currentAdmin(): Promise<AdminSession | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, signingKey());
    if (!payload.sub || typeof payload.csrf !== 'string') return null;
    return {
      id: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : '',
      role: payload.role === 'moderator' ? 'moderator' : 'admin',
      csrf: payload.csrf,
    };
  } catch {
    return null;
  }
}

export async function requireAdmin(): Promise<AdminSession> {
  const admin = await currentAdmin();
  if (!admin) throw AppError.unauthorized();
  return admin;
}

export async function requireAdminMutation(request: NextRequest): Promise<AdminSession> {
  const admin = await requireAdmin();
  const provided = request.headers.get(CSRF_HEADER) ?? '';
  if (!provided || !timingSafeEqualString(provided, admin.csrf))
    throw AppError.forbidden('Invalid or missing CSRF token');
  return admin;
}

export async function requireAdminRole(request: NextRequest): Promise<AdminSession> {
  const admin = await requireAdminMutation(request);
  if (admin.role !== 'admin') throw AppError.forbidden('Administrators only');
  return admin;
}

export async function setupAdministrator(email: string, password: string, secret: string) {
  const env = getEnv();
  if (!env.ADMIN_BOOTSTRAP_SECRET || !env.ADMIN_BOOTSTRAP_EMAIL)
    throw AppError.notFound('Bootstrap is not configured');
  const db = getSql();
  if ((await adminsRepo.count(db)) > 0) throw AppError.conflict('An administrator already exists');
  if (!timingSafeEqualString(secret, env.ADMIN_BOOTSTRAP_SECRET))
    throw AppError.unauthorized('Invalid bootstrap secret');
  if (email.trim().toLowerCase() !== env.ADMIN_BOOTSTRAP_EMAIL.toLowerCase())
    throw AppError.badRequest('Email does not match the bootstrap configuration');
  if (password.length < 12) throw AppError.badRequest('Password must be at least 12 characters');
  const id = await adminsRepo.create(db, {
    email: email.trim().toLowerCase(),
    passwordHash: await hashPassword(password),
    role: 'admin',
  });
  await auditRepo.record(db, { actorType: 'system', actorId: id, eventType: 'admin_bootstrapped' });
  log('admin_bootstrapped', { email: email.trim().toLowerCase() });
}

export function authCookies(jwt: string, csrf: string) {
  const secure = isProduction();
  const maxAge = 60 * 60 * 12;
  return [
    {
      name: SESSION_COOKIE,
      value: jwt,
      options: { httpOnly: true, sameSite: 'lax' as const, secure, path: '/', maxAge },
    },
    {
      name: CSRF_COOKIE,
      value: csrf,
      options: { httpOnly: false, sameSite: 'lax' as const, secure, path: '/', maxAge },
    },
  ];
}

export function clearedAuthCookies() {
  const secure = isProduction();
  return [SESSION_COOKIE, CSRF_COOKIE].map((name) => ({
    name,
    value: '',
    options: {
      httpOnly: name === SESSION_COOKIE,
      sameSite: 'lax' as const,
      secure,
      path: '/',
      maxAge: 0,
    },
  }));
}
