import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deriveRisk, resolveRisk } from '../../server/analysis/risk.js';
import { ClaudeFinding } from '../../server/analysis/schemas.js';
import { openDb, type Db } from '../../server/db/index.js';
import { createRepos } from '../../server/db/repos/index.js';
import { buildMarkdown } from '../../server/report/export-md.js';
import { initRedaction } from '../../server/redact/index.js';

const base = { severity: 'high', category: 'injection', rule: 'eval-use', title: 'eval', file: 'a.js', line: 1, explanation: 'e', fix: 'f' };

describe('risk derivation', () => {
  it('maps severity to 5 levels and category to a threat', () => {
    expect(deriveRisk({ category: 'injection', severity: 'critical', title: 'T' })).toMatchObject({ vulnerability: 'T', probability: 'very-high', impact: 'very-high' });
    expect(deriveRisk({ category: 'secrets', severity: 'high', title: 'T' })).toMatchObject({ probability: 'very-high', impact: 'high' });
    expect(deriveRisk({ category: 'quality', severity: 'low', title: 'T' })).toMatchObject({ probability: 'low', impact: 'very-low' });
    expect(deriveRisk({ category: 'quality', severity: 'info', title: 'T' }).probability).toBe('very-low');
    expect(deriveRisk({ category: 'secrets', severity: 'medium', title: 'T' }).threat).toMatch(/identifiants/);
  });
  it('resolveRisk keeps valid fields and falls back on invalid ones', () => {
    const r = resolveRisk({ category: 'injection', severity: 'medium', title: 'T', risk: { threat: 'custom', probability: 'bogus' as never, impact: 'low' } });
    expect(r).toMatchObject({ vulnerability: 'T', threat: 'custom', probability: 'medium', impact: 'low' });
  });
});

describe('ClaudeFinding schema', () => {
  it('accepts risk fields', () => {
    const r = ClaudeFinding.parse({ ...base, vulnerability: 'v', threat: 't', probability: 'very-high', impact: 'low' });
    expect(r).toMatchObject({ probability: 'very-high', impact: 'low' });
  });
  it('drops out-of-range levels (fallback to derivation) without rejecting the finding', () => {
    const r = ClaudeFinding.parse({ ...base, probability: 'extreme', impact: 5 });
    expect(r.probability).toBeUndefined(); expect(r.impact).toBeUndefined();
  });
  it('accepts findings without risk fields', () => {
    expect(ClaudeFinding.safeParse(base).success).toBe(true);
  });
});

describe('persistence and export', () => {
  let dir: string; let db: Db;
  beforeEach(() => {
    initRedaction({ dataDir: '/d', workDir: '/w', hostname: os.hostname(), username: os.userInfo().username, homeDir: os.homedir() });
    dir = mkdtempSync(join(os.tmpdir(), 'risk-')); db = openDb(join(dir, 's.db'));
  });
  afterEach(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });

  it('round-trips the matrix and derives one for legacy rows', () => {
    const repos = createRepos(db);
    const f = { id: 'a', scanId: 's1', severity: 'high' as const, category: 'secrets' as const, rule: 'r', title: 'Key', file: 'a.js', line: 1, snippet: 's',
      explanation: 'e', fix: 'f', source: 'local' as const, fingerprint: 'x'.repeat(64),
      risk: { vulnerability: 'v', threat: 'th', probability: 'low' as const, impact: 'very-high' as const } };
    repos.findings.insertMany([f]);
    expect(repos.findings.get('a')?.risk).toEqual(f.risk);
    db.raw.prepare("INSERT INTO findings(id,scan_id,severity,category,rule,title,file,line,snippet,explanation,fix,source,fingerprint) VALUES('old','s0','medium','ci-cd','r','Old','w.yml',1,'','e','f','local','y')").run();
    expect(repos.findings.get('old')?.risk).toMatchObject({ vulnerability: 'Old', probability: 'medium', impact: 'medium' });
  });

  it('markdown includes the matrix, redacted', () => {
    const token = 'ghp_' + 'a'.repeat(36);
    const md = buildMarkdown({ scan: { repo: 'o/n', ref: null, commitSha: null, status: 'done', usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 } }, score: 80, scoreFormula: '', claudeVerdict: null,
      justification: null, counts: { critical: 0, high: 1, medium: 0, low: 0, info: 0 }, passes: [], partial: false,
      outbound: { files: 0, bytesToClaude: 0, promptBytes: 0, destinations: [], blockedConnections: 0 },
      findings: [{ id: 'a', severity: 'high', category: 'secrets', rule: 'r', title: 'T', file: 'a', line: 1, snippet: '', explanation: 'e', fix: '', source: 'local',
        risk: { vulnerability: `leak ${token}`, threat: 'th', probability: 'very-high', impact: 'low' } }] } as never);
    expect(md).toContain('Matrice de risque');
    expect(md).toContain('probabilité — très élevée ; impact — faible');
    expect(md).not.toContain(token);
  });
});
