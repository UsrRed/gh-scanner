import type { Db } from '../index.js';

export interface AuthSession { id: string; csrf: string; createdAt: string; expiresAt: string }

export function authRepo(db: Db) {
  return {
    create(s: AuthSession): void {
      db.raw.prepare('INSERT INTO auth_sessions(id,csrf,created_at,expires_at) VALUES(?,?,?,?)').run(s.id, s.csrf, s.createdAt, s.expiresAt);
    },
    /** Returns the session if present and not expired at `now`. */
    get(id: string, now = new Date().toISOString()): AuthSession | null {
      const r = db.raw.prepare('SELECT * FROM auth_sessions WHERE id=? AND expires_at>?').get(id, now) as
        { id: string; csrf: string; created_at: string; expires_at: string } | undefined;
      return r ? { id: r.id, csrf: r.csrf, createdAt: r.created_at, expiresAt: r.expires_at } : null;
    },
    delete(id: string): void {
      db.raw.prepare('DELETE FROM auth_sessions WHERE id=?').run(id);
    },
    purgeExpired(now = new Date().toISOString()): number {
      return db.raw.prepare('DELETE FROM auth_sessions WHERE expires_at<=?').run(now).changes;
    },
    recordLoginAttempt(ip: string, ts = Date.now()): void {
      db.raw.prepare('INSERT INTO login_attempts(ip,ts) VALUES(?,?)').run(ip, ts);
    },
    countLoginAttempts(ip: string, sinceTs: number): number {
      return (db.raw.prepare('SELECT COUNT(*) c FROM login_attempts WHERE ip=? AND ts>=?').get(ip, sinceTs) as { c: number }).c;
    },
    purgeLoginAttempts(beforeTs: number): void {
      db.raw.prepare('DELETE FROM login_attempts WHERE ts<?').run(beforeTs);
    },
  };
}
