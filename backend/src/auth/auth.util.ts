import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { SetMetadata } from '@nestjs/common';

/** Roles: admin (everything), viewer (management, read-only), tally_uploader, feedback_uploader. */
export const ROLES = ['admin', 'viewer', 'tally_uploader', 'feedback_uploader'] as const;
export type Role = (typeof ROLES)[number];

export interface SessionUser {
  id: number;
  email: string;
  name: string;
  role: Role;
}

export const IS_PUBLIC = 'isPublic';
export const ROLES_KEY = 'roles';
/** Route needs no login (it is protected another way, e.g. agent token or admin key). */
export const Public = () => SetMetadata(IS_PUBLIC, true);
/** Route needs one of these roles (admin is always allowed). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

// ---- passwords: scrypt, stored as scrypt$<salt>$<hash> ----
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('base64')}$${scryptSync(password, salt, 64).toString('base64')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = scryptSync(password, Buffer.from(salt, 'base64'), expected.length);
  return timingSafeEqual(actual, expected);
}

// ---- session tokens: base64url(payload).base64url(HMAC-SHA256) ----
const SESSION_HOURS = Number(process.env.SESSION_HOURS ?? 12);

function secret(): string {
  const s = process.env.SESSION_SECRET ?? '';
  if (s.length < 32) throw new Error('SESSION_SECRET must be set (32+ characters)');
  return s;
}

export function signSession(user: SessionUser): { token: string; expiresAt: Date } {
  const exp = Date.now() + SESSION_HOURS * 3600_000;
  const payload = Buffer.from(JSON.stringify({ ...user, exp })).toString('base64url');
  const sig = createHmac('sha256', secret()).update(payload).digest('base64url');
  return { token: `${payload}.${sig}`, expiresAt: new Date(exp) };
}

export function verifySession(token: string): (SessionUser & { exp: number }) | null {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = createHmac('sha256', secret()).update(payload).digest();
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return typeof data.exp === 'number' && data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}
