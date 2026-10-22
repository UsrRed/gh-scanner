import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { openDb, type Db } from '../../server/db/index.js';
import { createRepos, type Repos } from '../../server/db/repos/index.js';
import { initRedaction } from '../../server/redact/index.js';
import { createReportService, type ReportService } from '../../server/report/index.js';
import type { Finding, Severity } from '../../shared/types.js';
import { assertNoLeaks, SIMULATED_TOKEN } from '../helpers/leak-check.js';

const DATA = '/srv/gh-data'; const WORK = '/srv/gh-data/work';
let dir: string; let db: Db; let repos: Repos; let svc: ReportService;
const usage = { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0.01 };
const fnd = (scanId: string, id: string, fp: string, severity: Severity, extra: Partial<Finding> = {}): Finding => ({
  id, scanId, severity, category: 'secrets', rule: 'r', title: 'T ' + id, file: 'a.js', line: 1, snippet: 'x', explanation: 'e', fix: 'f',
  source: 'local', fingerprint: fp, risk: { vulnerability: 'v', threat: 'th', probability: 'medium', impact: 'medium' }, ...extra });

beforeEach(() => {
  initRedaction({ dataDir: DATA, workDir: WORK, hostname: os.hostname(), username: os.userInfo().username, homeDir: os.homedir() });
  dir = mkdtempSync(join(os.tmpdir(), 'rep-'));
  db = openDb(join(dir, 's.db')); repos = createRepos(db);
  svc = createReportService({ repos, egressLog: { summaryForScan: () => ({ destinations: [{ host: 'api.anthropic.com', connections: 2, bytesUp: 100, bytesDown: 200 }], blockedConnections: 1 }) } });
});
afterEach(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });

function mk(id: string, repo: string, score: number, fs: Finding[]) {
  repos.scans.create({ id, repo, ref: null, keepClone: false });
  repos.scans.update(id, { status: 'done', score, claudeVerdict: 'caution', justification: 'ok', usage });
  repos.findings.insertMany(fs);
}

describe('report', () => {
  it('builds report with counts, passes and outbound summary', () => {
    mk('s1', 'o/r', 55, [fnd('s1', 'f1', 'A', 'critical'), fnd('s1', 'f2', 'B', 'low')]);
    repos.claudeSessions.insert({ id: 'c1', scanId: 's1', pass: 'mapping', batch: null, model: 'm', prompt: 'p', promptBytes: 42, usage, status: 'ok', startedAt: 't', endedAt: 't' });
    repos.outbound.insert({ id: 'o1', sessionId: 'c1', scanId: 's1', tool: 'Read', path: 'a.js', pattern: null, lines: 1, bytes: 30, excerpt: null, ts: 't' });
    const r = svc.buildReport('s1');
    expect(r.counts).toMatchObject({ critical: 1, low: 1, high: 0 });
    expect(r.passes).toHaveLength(1);
    expect(r.outbound).toMatchObject({ files: 1, bytesToClaude: 30, promptBytes: 42, blockedConnections: 1 });
    expect(r.outbound.destinations[0]!.host).toBe('api.anthropic.com');
    expect(r.claudeVerdict).toBe('caution');
  });

  it('compares by fingerprint with score delta; rejects different repos', () => {
    mk('s1', 'o/r', 60, [fnd('s1', 'f1', 'A', 'high'), fnd('s1', 'f2', 'B', 'low')]);
    mk('s2', 'o/r', 90, [fnd('s2', 'f3', 'B', 'low'), fnd('s2', 'f4', 'C', 'medium')]);
    mk('s3', 'x/y', 100, []);
    const c = svc.compareScans('s1', 's2');
    expect(c.scoreDelta).toBe(30);
    expect(c.added.map((f) => f.fingerprint)).toEqual(['C']);
    expect(c.resolved.map((f) => f.fingerprint)).toEqual(['A']);
    expect(c.persisting.map((f) => f.fingerprint)).toEqual(['B']);
    expect(() => svc.compareScans('s1', 's3')).toThrow();
  });

  it('exports contain schemaVersion and leak nothing', () => {
    mk('s1', 'o/r', 90, [fnd('s1', 'f1', 'A', 'high', { explanation: `see ${DATA}/x and ${WORK}/s1/y user ${os.userInfo().username}@${os.hostname()} ${SIMULATED_TOKEN}` })]);
    repos.scans.update('s1', { justification: `${SIMULATED_TOKEN} ${DATA}` });
    const j = svc.exportJson('s1');
    expect(j.schemaVersion).toBe(1);
    const md = svc.exportMarkdown('s1');
    expect(md).toContain('# Rapport de scan');
    expect(md).toContain('| high |');
    const ctx = { dataDir: DATA, workDir: WORK };
    assertNoLeaks(JSON.stringify(j), ctx);
    assertNoLeaks(md, ctx);
  });
});
