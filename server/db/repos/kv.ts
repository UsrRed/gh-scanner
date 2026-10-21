import type { Db } from '../index.js';
import { redact } from '../../redact/index.js';

export function kvRepo(db: Db) {
  return {
    get(key: string): string | null {
      const r = db.raw.prepare('SELECT value FROM kv WHERE key=?').get(key) as { value: string } | undefined;
      return r ? r.value : null;
    },
    set(key: string, value: string): void {
      db.raw.prepare('INSERT INTO kv(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, redact(value));
    },
    delete(key: string): void {
      db.raw.prepare('DELETE FROM kv WHERE key=?').run(key);
    },
  };
}
