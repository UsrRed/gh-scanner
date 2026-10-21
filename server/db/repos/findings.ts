import type { Db } from '../index.js';
import type { Finding } from '../../../shared/types.js';
import { redact } from '../../redact/index.js';

type Row = Omit<Finding, 'scanId'> & { scan_id: string };
const toFinding = (r: Row): Finding => ({
  id: r.id, scanId: r.scan_id, severity: r.severity, category: r.category, rule: r.rule, title: r.title,
  file: r.file, line: r.line, snippet: r.snippet, explanation: r.explanation, fix: r.fix, source: r.source, fingerprint: r.fingerprint,
});
const ORDER = "CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END, file, line, id";

export function findingsRepo(db: Db) {
  return {
    insertMany(fs: Finding[]): void {
      const st = db.raw.prepare(`INSERT INTO findings(id,scan_id,severity,category,rule,title,file,line,snippet,explanation,fix,source,fingerprint)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      db.tx(() => {
        for (const f of fs) {
          st.run(f.id, f.scanId, f.severity, f.category, f.rule, redact(f.title), redact(f.file), f.line,
            redact(f.snippet, { repoContent: true }), redact(f.explanation), redact(f.fix), f.source, f.fingerprint);
        }
      });
    },
    listByScan(scanId: string): Finding[] {
      return (db.raw.prepare(`SELECT * FROM findings WHERE scan_id=? ORDER BY ${ORDER}`).all(scanId) as Row[]).map(toFinding);
    },
    get(id: string): Finding | null {
      const r = db.raw.prepare('SELECT * FROM findings WHERE id=?').get(id) as Row | undefined;
      return r ? toFinding(r) : null;
    },
    deleteByScan(scanId: string): void {
      db.raw.prepare('DELETE FROM findings WHERE scan_id=?').run(scanId);
    },
  };
}
