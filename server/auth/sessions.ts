import { createHash, randomBytes } from 'node:crypto';
import type { Db } from '../db/index.js';
import { authRepo } from '../db/repos/auth.js';

export const COOKIE_NAME = 'gsid';
export const SESSION_TTL_MS = 12 * 3600 * 1000;

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

export interface ActiveSession { id: string; csrf: string }

export function createSession(db: Db): { token: string; csrf: string } {
  const token = randomBytes(32).toString('base64url');
  const csrf = randomBytes(24).toString('base64url');
  const now = Date.now();
  authRepo(db).create({ id: sha(token), csrf, createdAt: new Date(now).toISOString(), expiresAt: new Date(now + SESSION_TTL_MS).toISOString() });
  return { token, csrf };
}

export function getSession(db: Db, token: string | undefined): ActiveSession | null {
  if (!token) return null;
  const s = authRepo(db).get(sha(token));
  return s ? { id: s.id, csrf: s.csrf } : null;
}

export function destroySession(db: Db, token: string | undefined): void {
  if (token) authRepo(db).delete(sha(token));
}

export function cookieOptions(secure: boolean) {
  return { path: '/', httpOnly: true, sameSite: 'strict' as const, secure, maxAge: SESSION_TTL_MS / 1000 };
}
