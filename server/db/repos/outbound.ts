import type { Db } from '../index.js';
import { redact } from '../../redact/index.js';

export interface OutboundRead {
  id: string; sessionId: string; scanId: string | null; tool: string; path: string | null; pattern: string | null;
  lines: number; bytes: number; excerpt: string | null; ts: string;
}
type Row = { id: string; session_id: string; scan_id: string | null; tool: string; path: string | null; pattern: string | null;
  lines: number; bytes: number; excerpt: string | null; ts: string };

export function outboundRepo(db: Db) {
  return {
    insert(r: OutboundRead): void {
      db.raw.prepare(`INSERT INTO outbound_reads(id,session_id,scan_id,tool,path,pattern,lines,bytes,excerpt,ts) VALUES(?,?,?,?,?,?,?,?,?,?)`)
        .run(r.id, r.sessionId, r.scanId, r.tool, r.path && redact(r.path), r.pattern && redact(r.pattern), r.lines, r.bytes,
          r.excerpt && redact(r.excerpt, { repoContent: true }), r.ts);
    },
    listByScan(scanId: string): OutboundRead[] {
      return (db.raw.prepare('SELECT * FROM outbound_reads WHERE scan_id=? ORDER BY ts, id').all(scanId) as Row[]).map((r) => ({
        id: r.id, sessionId: r.session_id, scanId: r.scan_id, tool: r.tool, path: r.path, pattern: r.pattern,
        lines: r.lines, bytes: r.bytes, excerpt: r.excerpt, ts: r.ts }));
    },
    /** Distinct files read and total bytes sent for a scan. */
    summary(scanId: string): { files: number; bytes: number } {
      const r = db.raw.prepare('SELECT COUNT(DISTINCT path) f, COALESCE(SUM(bytes),0) b FROM outbound_reads WHERE scan_id=? AND path IS NOT NULL')
        .get(scanId) as { f: number; b: number };
      return { files: r.f, bytes: r.b };
    },
  };
}
