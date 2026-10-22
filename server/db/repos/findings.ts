import type { Db } from '../index.js';
import type { Finding } from '../../../shared/types.js';
import { resolveRisk } from '../../analysis/risk.js';
import { redact, redactDeep } from '../../redact/index.js';

type Row = Omit<Finding, 'scanId' | 'risk'> & { scan_id: string; risk_json: string | null };
const parseRisk = (r: Row): Finding['risk'] => {
  let raw: Partial<Finding['risk']> | null = null;
  try { raw = r.risk_json ? JSON.parse(r.risk_json) : null; } catch { /* legacy or corrupt row: derive */ }
  return resolveRisk({ category: r.category, severity: r.severity, title: r.title, rule: r.rule, risk: raw });
};
const toFinding = (r: Row): Finding => ({
  id: r.id, scanId: r.scan_id, severity: r.severity, category: r.category, rule: r.rule, title: r.title,
  file: r.file, line: r.line, snippet: r.snippet, explanation: r.explanation, fix: r.fix, source: r.source, fingerprint: r.fingerprint, risk: parseRisk(r),
});
const ORDER = "CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END, file, line, id";

export function findingsRepo(db: Db) {
  return {
    insertMany(fs: Finding[]): void {
      const st = db.raw.prepare(`INSERT INTO findings(id,scan_id,severity,category,rule,title,file,line,snippet,explanation,fix,source,fingerprint,risk_json)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      db.tx(() => {
        for (const f of fs) {
          st.run(f.id, f.scanId, f.severity, f.category, f.rule, redact(f.title), redact(f.file), f.line,
            redact(f.snippet, { repoContent: true }), redact(f.explanation), redact(f.fix), f.source, f.fingerprint,
            JSON.stringify(redactDeep(resolveRisk({ ...f, risk: f.risk }))));
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
