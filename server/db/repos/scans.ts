import type { Db } from '../index.js';
import { num } from '../index.js';
import type { Page, Scan, ScanStatus, Usage, Verdict } from '../../../shared/types.js';
import { redact } from '../../redact/index.js';

export const ZERO_USAGE: Usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0 };

export interface ScanListFilter { repo?: string; status?: ScanStatus | ScanStatus[]; from?: string; to?: string }
export interface ScanUpdate {
  status?: ScanStatus; failure?: { code: string; message: string } | null; commitSha?: string | null;
  startedAt?: string | null; finishedAt?: string | null; usage?: Usage; score?: number | null;
  claudeVerdict?: Verdict | null; justification?: string | null; partial?: boolean; keepClone?: boolean;
}

type Row = { id: string; repo: string; ref: string | null; keep_clone: number; status: ScanStatus; failure_code: string | null;
  failure_message: string | null; commit_sha: string | null; created_at: string; started_at: string | null; finished_at: string | null;
  usage_json: string; score: number | null; claude_verdict: Verdict | null; justification: string | null; partial: number;
  previous_scan_id: string | null };

const map = (r: Row): Scan => ({
  id: r.id, repo: r.repo, ref: r.ref, keepClone: r.keep_clone === 1, status: r.status,
  failure: r.failure_code ? { code: r.failure_code, message: r.failure_message ?? '' } : null,
  queuePosition: null, commitSha: r.commit_sha, createdAt: r.created_at, startedAt: r.started_at, finishedAt: r.finished_at,
  usage: JSON.parse(r.usage_json) as Usage, score: r.score, claudeVerdict: r.claude_verdict, previousScanId: r.previous_scan_id,
});

export function scansRepo(db: Db) {
  const get = (id: string): Scan | null => {
    const r = db.raw.prepare('SELECT * FROM scans WHERE id=?').get(id) as Row | undefined;
    return r ? map(r) : null;
  };
  return {
    /** Inserts a queued scan; previous_scan_id = latest scan of the same repo. */
    create(i: { id: string; repo: string; ref: string | null; keepClone: boolean; createdAt?: string }): Scan {
      return db.tx(() => {
        const prev = db.raw.prepare('SELECT id FROM scans WHERE repo=? ORDER BY created_at DESC, rowid DESC LIMIT 1').get(i.repo) as { id: string } | undefined;
        db.raw.prepare(`INSERT INTO scans(id,repo,ref,keep_clone,status,created_at,usage_json,previous_scan_id) VALUES(?,?,?,?, 'queued', ?, ?, ?)`)
          .run(i.id, i.repo, i.ref, num(i.keepClone), i.createdAt ?? new Date().toISOString(), JSON.stringify(ZERO_USAGE), prev?.id ?? null);
        return get(i.id)!;
      });
    },
    get,
    update(id: string, u: ScanUpdate): Scan | null {
      const sets: string[] = []; const args: (string | number | null)[] = [];
      const add = (c: string, v: string | number | null) => { sets.push(`${c}=?`); args.push(v); };
      if (u.status !== undefined) add('status', u.status);
      if (u.failure !== undefined) {
        add('failure_code', u.failure ? u.failure.code : null);
        add('failure_message', u.failure ? redact(u.failure.message) : null);
      }
      if (u.commitSha !== undefined) add('commit_sha', u.commitSha);
      if (u.startedAt !== undefined) add('started_at', u.startedAt);
      if (u.finishedAt !== undefined) add('finished_at', u.finishedAt);
      if (u.usage !== undefined) add('usage_json', JSON.stringify(u.usage));
      if (u.score !== undefined) add('score', u.score);
      if (u.claudeVerdict !== undefined) add('claude_verdict', u.claudeVerdict);
      if (u.justification !== undefined) add('justification', u.justification === null ? null : redact(u.justification));
      if (u.partial !== undefined) add('partial', num(u.partial));
      if (u.keepClone !== undefined) add('keep_clone', num(u.keepClone));
      if (sets.length) db.raw.prepare(`UPDATE scans SET ${sets.join(',')} WHERE id=?`).run(...args, id);
      return get(id);
    },
    meta(id: string): { justification: string | null; partial: boolean } | null {
      const r = db.raw.prepare('SELECT justification, partial FROM scans WHERE id=?').get(id) as { justification: string | null; partial: number } | undefined;
      return r ? { justification: r.justification, partial: r.partial === 1 } : null;
    },
    delete(id: string): void {
      db.tx(() => {
        for (const t of ['findings', 'scan_logs', 'claude_sessions', 'outbound_reads', 'egress_events']) {
          db.raw.prepare(`DELETE FROM ${t} WHERE scan_id=?`).run(id);
        }
        db.raw.prepare('DELETE FROM scans WHERE id=?').run(id);
      });
    },
    /** Filter by repo / status / created_at range, newest first, paginated (page is 1-based). */
    list(f: ScanListFilter, page: number, pageSize: number): Page<Scan> {
      const c: string[] = []; const args: (string | number)[] = [];
      if (f.repo) { c.push('repo=?'); args.push(f.repo); }
      if (f.status) {
        const st = Array.isArray(f.status) ? f.status : [f.status];
        c.push(`status IN (${st.map(() => '?').join(',')})`); args.push(...st);
      }
      if (f.from) { c.push('created_at>=?'); args.push(f.from); }
      if (f.to) { c.push('created_at<=?'); args.push(f.to); }
      const w = c.length ? ' WHERE ' + c.join(' AND ') : '';
      const total = (db.raw.prepare(`SELECT COUNT(*) c FROM scans${w}`).get(...args) as { c: number }).c;
      const rows = db.raw.prepare(`SELECT * FROM scans${w} ORDER BY created_at DESC, rowid DESC LIMIT ? OFFSET ?`)
        .all(...args, pageSize, (page - 1) * pageSize) as Row[];
      return { items: rows.map(map), total, page, pageSize };
    },
    /** Queued scans, oldest first. */
    queued(): Scan[] {
      return (db.raw.prepare("SELECT * FROM scans WHERE status='queued' ORDER BY created_at, rowid").all() as Row[]).map(map);
    },
    byStatus(statuses: ScanStatus[]): Scan[] {
      return (db.raw.prepare(`SELECT * FROM scans WHERE status IN (${statuses.map(() => '?').join(',')}) ORDER BY created_at, rowid`)
        .all(...statuses) as Row[]).map(map);
    },
  };
}
