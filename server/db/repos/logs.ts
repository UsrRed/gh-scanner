import type { Db } from '../index.js';
import { redact } from '../../redact/index.js';

export interface LogEntry { seq: number; ts: string; level: 'info' | 'warn' | 'error'; message: string }

export function logsRepo(db: Db) {
  return {
    append(scanId: string, level: LogEntry['level'], message: string, ts = new Date().toISOString()): LogEntry {
      const msg = redact(message);
      const r = db.tx(() => {
        const seq = (db.raw.prepare('SELECT COALESCE(MAX(seq),0)+1 s FROM scan_logs WHERE scan_id=?').get(scanId) as { s: number }).s;
        db.raw.prepare('INSERT INTO scan_logs(scan_id,seq,ts,level,message) VALUES(?,?,?,?,?)').run(scanId, seq, ts, level, msg);
        return seq;
      });
      return { seq: r, ts, level, message: msg };
    },
    list(scanId: string, after = 0, limit = 1000): LogEntry[] {
      return db.raw.prepare('SELECT seq,ts,level,message FROM scan_logs WHERE scan_id=? AND seq>? ORDER BY seq LIMIT ?')
        .all(scanId, after, limit) as LogEntry[];
    },
  };
}
