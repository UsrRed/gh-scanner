import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, type Db } from '../../server/db/index.js';
import { createRepos, type Repos } from '../../server/db/repos/index.js';
import { initRedaction } from '../../server/redact/index.js';
import type { EgressEvent, Finding } from '../../shared/types.js';

let dir: string; let db: Db; let r: Repos;
const TOKEN = 'ghp_' + 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8';
beforeEach(() => {
  initRedaction({ dataDir: '/data', workDir: '/data/work', hostname: 'myhost', username: 'alice', homeDir: '/home/alice' });
  dir = mkdtempSync(join(tmpdir(), 'db-'));
  db = openDb(join(dir, 'scanner.db')); r = createRepos(db);
});
afterEach(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });

const finding = (id: string, scanId: string, over: Partial<Finding> = {}): Finding => ({
  id, scanId, severity: 'high', category: 'secrets', rule: 'r', title: 't', file: 'a.js', line: 3, snippet: 's',
  explanation: 'e', fix: 'f', source: 'local', fingerprint: 'x'.repeat(64), ...over });
const ev = (id: string, over: Partial<EgressEvent> = {}): EgressEvent => ({ id, startedAt: '2026-01-01T00:00:00Z', endedAt: '2026-01-01T00:00:01Z',
  host: 'api.anthropic.com', port: 443, bytesUp: 10, bytesDown: 20, durationMs: 1000, status: 'ok', httpStatus: 200, blocked: false,
  purpose: 'app', scanId: null, error: null, ...over });

describe('migrations', () => {
  it('are idempotent across opens', () => {
    const before = db.raw.prepare('SELECT * FROM schema_migrations').all();
    expect(before).toHaveLength(1);
    db.close();
    db = openDb(join(dir, 'scanner.db'));
    expect(db.raw.prepare('SELECT * FROM schema_migrations').all()).toEqual(before);
    expect(db.raw.pragma('journal_mode', { simple: true })).toBe('wal');
  });
});

describe('scans', () => {
  it('crud and previous link', () => {
    const a = r.scans.create({ id: 'a', repo: 'o/n', ref: null, keepClone: false, createdAt: '2026-01-01T00:00:00Z' });
    expect(a.status).toBe('queued'); expect(a.previousScanId).toBeNull();
    const b = r.scans.create({ id: 'b', repo: 'o/n', ref: 'v1', keepClone: true, createdAt: '2026-01-02T00:00:00Z' });
    expect(b.previousScanId).toBe('a'); expect(b.keepClone).toBe(true);
    const u = r.scans.update('b', { status: 'failed', failure: { code: 'x', message: `boom ${TOKEN}` }, score: 55, partial: true });
    expect(u!.status).toBe('failed'); expect(u!.failure!.message).toContain('[REDACTED:'); expect(u!.failure!.message).not.toContain(TOKEN);
    expect(r.scans.meta('b')!.partial).toBe(true);
    r.scans.delete('a'); expect(r.scans.get('a')).toBeNull();
  });
  it('filters and paginates', () => {
    for (let i = 1; i <= 5; i++) r.scans.create({ id: `s${i}`, repo: i % 2 ? 'o/a' : 'o/b', ref: null, keepClone: false, createdAt: `2026-01-0${i}T00:00:00Z` });
    r.scans.update('s2', { status: 'done' });
    expect(r.scans.list({}, 1, 2).items.map((s) => s.id)).toEqual(['s5', 's4']);
    expect(r.scans.list({}, 3, 2).items.map((s) => s.id)).toEqual(['s1']);
    expect(r.scans.list({}, 1, 2).total).toBe(5);
    expect(r.scans.list({ repo: 'o/a' }, 1, 10).total).toBe(3);
    expect(r.scans.list({ status: 'done' }, 1, 10).items.map((s) => s.id)).toEqual(['s2']);
    expect(r.scans.list({ from: '2026-01-02T00:00:00Z', to: '2026-01-04T00:00:00Z' }, 1, 10).total).toBe(3);
    expect(r.scans.queued().map((s) => s.id)).toEqual(['s1', 's3', 's4', 's5']);
  });
});

describe('findings', () => {
  it('insert, list ordered, masked snippet', () => {
    r.scans.create({ id: 'a', repo: 'o/n', ref: null, keepClone: false });
    r.findings.insertMany([finding('f1', 'a', { severity: 'low' }), finding('f2', 'a', { severity: 'critical', snippet: `k=${TOKEN}` })]);
    const l = r.findings.listByScan('a');
    expect(l.map((f) => f.id)).toEqual(['f2', 'f1']);
    expect(l[0]!.snippet).not.toContain(TOKEN);
    expect(r.findings.get('f1')!.line).toBe(3);
  });
  it('transaction rolls back', () => {
    expect(() => db.tx(() => { r.findings.insertMany([finding('f1', 'a')]); throw new Error('x'); })).toThrow();
    expect(r.findings.get('f1')).toBeNull();
  });
});

describe('logs', () => {
  it('stores masked, sequenced', () => {
    r.logs.append('a', 'info', `token ${TOKEN}`);
    r.logs.append('a', 'warn', 'second');
    const l = r.logs.list('a');
    expect(l.map((x) => x.seq)).toEqual([1, 2]);
    expect(l[0]!.message).not.toContain(TOKEN);
    expect(JSON.stringify(db.raw.prepare('SELECT * FROM scan_logs').all())).not.toContain(TOKEN);
    expect(r.logs.list('a', 1)).toHaveLength(1);
  });
});

describe('claude sessions and outbound', () => {
  it('roundtrip', () => {
    const usage = { inputTokens: 1, outputTokens: 2, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0.1 };
    r.claudeSessions.insert({ id: 'c1', scanId: 'a', pass: 'mapping', batch: null, model: 'm', prompt: `p ${TOKEN}`, promptBytes: 5,
      usage, status: 'ok', startedAt: '2026-01-01T00:00:00Z', endedAt: null });
    r.claudeSessions.finish('c1', { usage: { ...usage, costUsd: 0.5 }, status: 'error' });
    const [s] = r.claudeSessions.listByScan('a');
    expect(s!.usage.costUsd).toBe(0.5); expect(s!.status).toBe('error'); expect(s!.prompt).not.toContain(TOKEN); expect(s!.endedAt).not.toBeNull();
    r.outbound.insert({ id: 'o1', sessionId: 'c1', scanId: 'a', tool: 'Read', path: 'a.js', pattern: null, lines: 3, bytes: 100, excerpt: 'x', ts: '2026-01-01T00:00:00Z' });
    r.outbound.insert({ id: 'o2', sessionId: 'c1', scanId: 'a', tool: 'Read', path: 'a.js', pattern: null, lines: 3, bytes: 50, excerpt: null, ts: '2026-01-01T00:00:01Z' });
    expect(r.outbound.listByScan('a')).toHaveLength(2);
    expect(r.outbound.summary('a')).toEqual({ files: 1, bytes: 150 });
  });
});

describe('egress events', () => {
  it('insert, filter, paginate, totals', () => {
    r.egressEvents.insertMany([
      ev('e1'), ev('e2', { host: 'evil.com', blocked: true, status: 'blocked', httpStatus: 403, startedAt: '2026-01-02T00:00:00Z' }),
      ev('e3', { scanId: 's', startedAt: '2026-01-03T00:00:00Z', error: `err ${TOKEN}` }),
    ]);
    r.egressEvents.insertMany([ev('e1')]); // duplicate ignored
    expect(r.egressEvents.list({}, 1, 2).items.map((e) => e.id)).toEqual(['e3', 'e2']);
    expect(r.egressEvents.list({ blocked: true }, 1, 10).items[0]!.blocked).toBe(true);
    expect(r.egressEvents.list({ scanId: 's' }, 1, 10).items[0]!.error).not.toContain(TOKEN);
    expect(r.egressEvents.totals({}).find((d) => d.host === 'api.anthropic.com')).toMatchObject({ connections: 2, bytesUp: 20, bytesDown: 40 });
    expect(r.egressEvents.lastBlockedAt()).toBe('2026-01-02T00:00:00Z');
    expect(r.egressEvents.count({ blocked: true })).toBe(1);
  });
});

describe('auth and kv', () => {
  it('sessions expire', () => {
    r.auth.create({ id: 'h', csrf: 'c', createdAt: '2026-01-01T00:00:00Z', expiresAt: '2026-01-02T00:00:00Z' });
    expect(r.auth.get('h', '2026-01-01T12:00:00Z')!.csrf).toBe('c');
    expect(r.auth.get('h', '2026-01-03T00:00:00Z')).toBeNull();
    expect(r.auth.purgeExpired('2026-01-03T00:00:00Z')).toBe(1);
    r.auth.recordLoginAttempt('1.2.3.4', 100); r.auth.recordLoginAttempt('1.2.3.4', 200);
    expect(r.auth.countLoginAttempts('1.2.3.4', 150)).toBe(1);
  });
  it('kv', () => {
    expect(r.kv.get('k')).toBeNull();
    r.kv.set('k', 'v1'); r.kv.set('k', 'v2');
    expect(r.kv.get('k')).toBe('v2');
    r.kv.delete('k'); expect(r.kv.get('k')).toBeNull();
  });
});
