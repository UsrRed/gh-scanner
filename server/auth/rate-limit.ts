import type { Db } from '../db/index.js';
import { authRepo } from '../db/repos/auth.js';

export const MAX_FAILURES = 5;
export const WINDOW_MS = 15 * 60 * 1000;

export function isBlocked(db: Db, ip: string, now = Date.now()): boolean {
  return authRepo(db).countLoginAttempts(ip, now - WINDOW_MS) >= MAX_FAILURES;
}

export function recordFailure(db: Db, ip: string, now = Date.now()): void {
  const repo = authRepo(db);
  repo.purgeLoginAttempts(now - WINDOW_MS);
  repo.recordLoginAttempt(ip, now);
}
