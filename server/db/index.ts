import Database from 'better-sqlite3';
import { MIGRATIONS } from './migrations.js';

export interface Db {
  raw: Database.Database;
  /** Runs fn in a transaction (nested calls join the outer one). */
  tx<T>(fn: () => T): T;
  close(): void;
}

export function migrate(raw: Database.Database): number[] {
  raw.exec('CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
  const done = new Set((raw.prepare('SELECT version FROM schema_migrations').all() as { version: number }[]).map((r) => r.version));
  const applied: number[] = [];
  for (const m of MIGRATIONS) {
    if (done.has(m.version)) continue;
    raw.transaction(() => {
      raw.exec(m.sql);
      raw.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES(?, ?)').run(m.version, new Date().toISOString());
    })();
    applied.push(m.version);
  }
  return applied;
}

export function openDb(path: string): Db {
  const raw = new Database(path);
  raw.pragma('journal_mode = WAL');
  raw.pragma('foreign_keys = ON');
  raw.pragma('busy_timeout = 5000');
  migrate(raw);
  let depth = 0;
  return {
    raw,
    tx<T>(fn: () => T): T {
      if (depth > 0) return fn();
      depth++;
      try {
        return raw.transaction(fn)();
      } finally {
        depth--;
      }
    },
    close: () => raw.close(),
  };
}

export const num = (b: boolean): number => (b ? 1 : 0);
