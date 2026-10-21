import type { Db } from '../index.js';
import { num } from '../index.js';
import type { EgressEvent, OutboundSummary, Page } from '../../../shared/types.js';
import { redact } from '../../redact/index.js';

export interface EgressFilter { host?: string; purpose?: string; scanId?: string; blocked?: boolean; from?: string; to?: string }
type Row = { id: string; started_at: string; ended_at: string; host: string; port: number; bytes_up: number; bytes_down: number;
  duration_ms: number; status: EgressEvent['status']; http_status: number; blocked: number; purpose: string; scan_id: string | null; error: string | null };
const map = (r: Row): EgressEvent => ({ id: r.id, startedAt: r.started_at, endedAt: r.ended_at, host: r.host, port: r.port,
  bytesUp: r.bytes_up, bytesDown: r.bytes_down, durationMs: r.duration_ms, status: r.status, httpStatus: r.http_status,
  blocked: r.blocked === 1, purpose: r.purpose, scanId: r.scan_id, error: r.error });

function where(f: EgressFilter): { sql: string; args: (string | number)[] } {
  const c: string[] = []; const args: (string | number)[] = [];
  if (f.host) { c.push('host=?'); args.push(f.host); }
  if (f.purpose) { c.push('purpose=?'); args.push(f.purpose); }
  if (f.scanId) { c.push('scan_id=?'); args.push(f.scanId); }
  if (f.blocked !== undefined) { c.push('blocked=?'); args.push(num(f.blocked)); }
  if (f.from) { c.push('started_at>=?'); args.push(f.from); }
  if (f.to) { c.push('started_at<=?'); args.push(f.to); }
  return { sql: c.length ? ' WHERE ' + c.join(' AND ') : '', args };
}

export function egressEventsRepo(db: Db) {
  const ins = db.raw.prepare(`INSERT OR IGNORE INTO egress_events(id,started_at,ended_at,host,port,bytes_up,bytes_down,duration_ms,status,http_status,blocked,purpose,scan_id,error)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  return {
    insertMany(es: EgressEvent[]): void {
      db.tx(() => {
        for (const e of es) {
          ins.run(e.id, e.startedAt, e.endedAt, redact(e.host), e.port, e.bytesUp, e.bytesDown, e.durationMs, e.status,
            e.httpStatus, num(e.blocked), redact(e.purpose), e.scanId, e.error && redact(e.error));
        }
      });
    },
    list(f: EgressFilter, page: number, pageSize: number): Page<EgressEvent> {
      const w = where(f);
      const total = (db.raw.prepare(`SELECT COUNT(*) c FROM egress_events${w.sql}`).get(...w.args) as { c: number }).c;
      const rows = db.raw.prepare(`SELECT * FROM egress_events${w.sql} ORDER BY started_at DESC, id LIMIT ? OFFSET ?`)
        .all(...w.args, pageSize, (page - 1) * pageSize) as Row[];
      return { items: rows.map(map), total, page, pageSize };
    },
    totals(f: EgressFilter): OutboundSummary['destinations'] {
      const w = where(f);
      return (db.raw.prepare(`SELECT host, COUNT(*) connections, SUM(bytes_up) bytesUp, SUM(bytes_down) bytesDown
        FROM egress_events${w.sql} GROUP BY host ORDER BY host`).all(...w.args)) as OutboundSummary['destinations'];
    },
    count(f: EgressFilter): number {
      const w = where(f);
      return (db.raw.prepare(`SELECT COUNT(*) c FROM egress_events${w.sql}`).get(...w.args) as { c: number }).c;
    },
    lastBlockedAt(): string | null {
      const r = db.raw.prepare('SELECT MAX(started_at) m FROM egress_events WHERE blocked=1').get() as { m: string | null };
      return r.m;
    },
  };
}
