import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { getEnv } from './env';

export const PRIVACY_RADIUS_METERS = 152.4;
export function hmacIp(ip: string) {
  return crypto.createHmac('sha256', getEnv().IP_HASH_SECRET).update(ip).digest('hex');
}
export function hashBrowserToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}
export async function hashEditToken(token: string) {
  return bcrypt.hash(token, 12);
}
export async function verifyEditToken(token: string, hash: string) {
  return bcrypt.compare(token, hash);
}
export function newOpaqueToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function approximatePoint(
  latitude: number,
  longitude: number,
  random = Math.random,
): { latitude: number; longitude: number } {
  const distance = Math.sqrt(random()) * PRIVACY_RADIUS_METERS;
  const bearing = random() * Math.PI * 2;
  const earthRadius = 6371008.8;
  const lat1 = (latitude * Math.PI) / 180;
  const lng1 = (longitude * Math.PI) / 180;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(distance / earthRadius) +
      Math.cos(lat1) * Math.sin(distance / earthRadius) * Math.cos(bearing),
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(distance / earthRadius) * Math.cos(lat1),
      Math.cos(distance / earthRadius) - Math.sin(lat1) * Math.sin(lat2),
    );
  return {
    latitude: (lat2 * 180) / Math.PI,
    longitude: (((lng2 * 180) / Math.PI + 540) % 360) - 180,
  };
}
