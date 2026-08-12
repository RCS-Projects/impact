import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { getEnv } from './env';

const cookieName = 'impact_admin_session';
const encoder = new TextEncoder();
type Session = { id: string; role: 'admin' | 'moderator'; email: string };

function key() {
  return encoder.encode(getEnv().SESSION_SECRET);
}
export async function createSession(session: Session) {
  return new SignJWT(session)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(key());
}
export async function currentAdmin(): Promise<Session | null> {
  const token = cookies().get(cookieName)?.value;
  if (!token) return null;
  try {
    return (await jwtVerify(token, key())).payload as unknown as Session;
  } catch {
    return null;
  }
}
export async function requireAdmin() {
  const admin = await currentAdmin();
  if (!admin || admin.role !== 'admin') throw new Error('Unauthorized');
  return admin;
}
export function sessionCookie(value: string) {
  return {
    name: cookieName,
    value,
    options: {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: getEnv().IMPACT_RUNTIME_MODE === 'production',
      path: '/',
      maxAge: 60 * 60 * 12,
    },
  };
}
