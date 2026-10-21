import type { Db } from '../index.js';
import type { PassName, Usage } from '../../../shared/types.js';
import { redact } from '../../redact/index.js';

export interface ClaudeSessionRow {
  id: string; scanId: string | null; pass: PassName; batch: string | null; model: string; prompt: string;
  promptBytes: number; usage: Usage; status: string; startedAt: string; endedAt: string | null;
}
type Row = { id: string; scan_id: string | null; pass: PassName; batch: string | null; model: string; prompt: string;
  prompt_bytes: number; usage_json: string; status: string; started_at: string; ended_at: string | null };
const map = (r: Row): ClaudeSessionRow => ({ id: r.id, scanId: r.scan_id, pass: r.pass, batch: r.batch, model: r.model,
  prompt: r.prompt, promptBytes: r.prompt_bytes, usage: JSON.parse(r.usage_json) as Usage, status: r.status,
  startedAt: r.started_at, endedAt: r.ended_at });

export function claudeSessionsRepo(db: Db) {
  return {
    insert(s: ClaudeSessionRow): void {
      db.raw.prepare(`INSERT INTO claude_sessions(id,scan_id,pass,batch,model,prompt,prompt_bytes,usage_json,status,started_at,ended_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(s.id, s.scanId, s.pass, s.batch, s.model, redact(s.prompt, { repoContent: true }),
        s.promptBytes, JSON.stringify(s.usage), s.status, s.startedAt, s.endedAt);
    },
    finish(id: string, p: { usage: Usage; status: string; endedAt?: string }): void {
      db.raw.prepare('UPDATE claude_sessions SET usage_json=?, status=?, ended_at=? WHERE id=?')
        .run(JSON.stringify(p.usage), p.status, p.endedAt ?? new Date().toISOString(), id);
    },
    listByScan(scanId: string): ClaudeSessionRow[] {
      return (db.raw.prepare('SELECT * FROM claude_sessions WHERE scan_id=? ORDER BY started_at, id').all(scanId) as Row[]).map(map);
    },
  };
}
