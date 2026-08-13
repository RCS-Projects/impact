import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { customAlphabet } from 'nanoid';

const PUBLIC_ID_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';
const publicIdGenerator = customAlphabet(PUBLIC_ID_ALPHABET, 8);

export function newPublicId(): string {
  return publicIdGenerator();
}

export function newOpaqueToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function newCsrfToken(): string {
  return crypto.randomBytes(24).toString('base64url');
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function hashEditToken(token: string): Promise<string> {
  return bcrypt.hash(token, 12);
}

export async function verifyEditToken(token: string, hash: string): Promise<boolean> {
  return bcrypt.compare(token, hash);
}
