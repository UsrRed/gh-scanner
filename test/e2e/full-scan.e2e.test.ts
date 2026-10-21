import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { Database } from '../helpers/sqlite-dump.js';
import { fakeSecret, makeVulnRepo } from '../fixtures/make-vuln-repo.js';
import { startEchoUpstream, type EchoUpstream } from '../fixtures/echo-upstream.js';
import { HOST_SECRET_VALUE, SIMULATED_TOKEN, assertNoLeaks, findLeaks } from '../helpers/leak-check.js';
import { tmpDirs } from '../helpers/tmp-dirs.js';
import { waitFor } from '../helpers/wait-for-status.js';

const td = tmpDirs();

const MAPPING = { languages: ['js'], entryPoints: [], manifests: ['package.json'], lockfiles: [], ciWorkflows: ['.github/workflows/pr.yml'],
  installScripts: ['package.json'], riskZones: [{ path: 'src/config.js', reason: 'secrets', categories: ['secrets'] }] };
const TARGETED = { findings: [{ severity: 'medium', category: 'quality', rule: 'weak-config', title: 'Weak config', file: 'src/config.js', line: 1,
  explanation: 'x', fix: 'y' }] };
const SYNTHESIS = { verdict: 'do-not-install', justification: 'Secret, postinstall and CI risks.', keyRisks: ['secret'] };

async function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = net.createServer().listen(0, '127.0.0.1', () => { const p = (s.address() as net.AddressInfo).port; s.close(() => resolve(p)); });
  });
}

let child: ChildProcess | undefined;
let echo: EchoUpstream;
let base = '';
let dataDir = '';
let workDir = '';
let logs = '';
let scanId = '';
const wsEvents: string[] = [];
const get = async (p: string) => fetch(base + p);

beforeAll(async () => {
  const root = td.make();
  dataDir = path.join(root, 'data'); workDir = path.join(dataDir, 'work');
  const fixture = makeVulnRepo(path.join(root, 'fixture'));
  writeFileSync(path.join(fixture, 'src', 'token.js'), `export const t = '${SIMULATED_TOKEN}';\n`);
  mkdirSync(path.join(dataDir, 'gh'), { recursive: true });
  mkdirSync(path.join(dataDir, 'claude-home'), { recursive: true });
  writeFileSync(path.join(dataDir, 'gh', '.fake-gh.json'), JSON.stringify({ fixtureDir: fixture, originUrl: fixture }));
  writeFileSync(path.join(dataDir, 'claude-home', '.fake-claude.json'),
    JSON.stringify({ outputs: { mapping: MAPPING, targeted: TARGETED, synthesis: SYNTHESIS } }));
  echo = await startEchoUpstream();
  const port = await freePort(); const egressPort = await freePort();
  base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    env: { PATH: process.env.PATH ?? '', HOST_SECRET: HOST_SECRET_VALUE, SCANNER_DATA_DIR: dataDir, SCANNER_WORK_DIR: workDir,
      SCANNER_HOST: '127.0.0.1', SCANNER_PORT: String(port), EGRESS_PORT: String(egressPort),
      SCANNER_GH_BIN: path.resolve('test/fixtures/fake-gh.mjs'), SCANNER_CLAUDE_BIN: path.resolve('test/fixtures/fake-claude.mjs'),
      EGRESS_HOST_OVERRIDES: `api.anthropic.com:443=127.0.0.1:${echo.port}` },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', (d: Buffer) => { logs += d.toString(); });
  child.stderr?.on('data', (d: Buffer) => { logs += d.toString(); });
  await waitFor(async () => { try { return (await get('/api/health')).ok; } catch { return false; } }, (v) => v, 25000, 100);
}, 40000);

afterAll(async () => {
  const c = child;
  if (c?.pid) { c.kill('SIGTERM'); await new Promise((r) => { c.once('exit', r); setTimeout(r, 3000); }); if (c.exitCode === null) c.kill('SIGKILL'); }
  await echo?.close();
  td.cleanup();
});

describe('full scan e2e', () => {
  it('scans the fixture to done and reports the 4 flaws', async () => {
    const ws = new WebSocket(base.replace('http', 'ws') + '/ws');
    ws.onmessage = (m) => { wsEvents.push(String(m.data)); };
    await new Promise<void>((r, j) => { ws.onopen = () => r(); ws.onerror = () => j(new Error('ws error')); });
    const res = await fetch(base + '/api/scans', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ repo: 'o/r' }) });
    expect(res.status).toBe(201);
    scanId = ((await res.json()) as { id: string }).id;
    await waitFor(() => wsEvents.join('\n'), (s) => /"status":"done"/.test(s), 30000, 100);
    ws.close();
    const scan = (await (await get(`/api/scans/${scanId}`)).json()) as { status: string };
    expect(scan.status).toBe('done');

    const report = (await (await get(`/api/scans/${scanId}/report`)).json()) as {
      findings: { severity: string; category: string; rule: string; title: string; file: string; line: number | null; snippet: string; explanation: string; fix: string }[];
    };
    const f = report.findings;
    const secret = f.find((x) => x.category === 'secrets' && x.severity === 'critical')!;
    const prt = f.find((x) => /pull[-_]request[-_]target/i.test(x.rule + x.title))!;
    const post = f.find((x) => x.category === 'install-scripts')!;
    const inj = f.find((x) => x.category === 'prompt-injection')!;
    for (const x of [secret, prt, post, inj]) {
      expect(x).toBeTruthy();
      expect(x.file.length).toBeGreaterThan(0);
      expect(x.line).toBeGreaterThan(0);
      expect(x.snippet.length).toBeGreaterThan(0);
      expect(x.explanation.length).toBeGreaterThan(0);
      expect(x.fix.length).toBeGreaterThan(0);
    }
    expect(secret.snippet).not.toContain(fakeSecret());
    expect(JSON.stringify(report)).not.toContain(fakeSecret());
  }, 40000);

  it('exports md and json', async () => {
    const md = await (await get(`/api/scans/${scanId}/export?format=md`)).text();
    expect(md).toMatch(/pull_request_target/i);
    expect(md).toContain('postinstall');
    const json = (await (await get(`/api/scans/${scanId}/export?format=json`)).json()) as { schemaVersion: number };
    expect(json.schemaVersion).toBe(1);
  });

  it('records egress: anthropic reached, statsig blocked with alert; outbound per file', async () => {
    const ev = (await (await get('/api/egress/events?pageSize=200')).json()) as { items: { host: string; blocked: boolean; purpose: string }[] };
    expect(ev.items.some((e) => e.host === 'api.anthropic.com' && !e.blocked && e.purpose.startsWith(`scan.${scanId}.claude`))).toBe(true);
    expect(ev.items.some((e) => e.host.includes('statsig') && e.blocked)).toBe(true);
    const alerts = (await (await get('/api/egress/alerts')).json()) as { unacknowledgedBlocked: number };
    expect(alerts.unacknowledgedBlocked).toBeGreaterThan(0);
    expect(echo.connections).toBeGreaterThan(0);
    const ob = (await (await get(`/api/scans/${scanId}/outbound`)).json()) as { files: { path: string; bytes: number }[]; summary: { blockedConnections: number } };
    expect(ob.files.some((x) => x.path === 'README.md' && x.bytes > 0)).toBe(true);
    expect(ob.summary.blockedConnections).toBeGreaterThan(0);
  });

  it('leaks nothing forbidden (db, logs, ws, exports)', async () => {
    const ctx = { dataDir, workDir };
    const dump = new Database(path.join(dataDir, 'scanner.db')).dumpText();
    const exports = (await (await get(`/api/scans/${scanId}/export?format=md`)).text())
      + (await (await get(`/api/scans/${scanId}/export?format=json`)).text())
      + (await (await get(`/api/scans/${scanId}/logs`)).text())
      + (await (await get(`/api/scans/${scanId}/outbound`)).text());
    // The data dir path legitimately appears in the raw process log line only if unmasked: it must not.
    expect(findLeaks(dump, ctx)).toEqual([]);
    assertNoLeaks(wsEvents.join('\n'), ctx);
    assertNoLeaks(exports, ctx);
    assertNoLeaks(logs, ctx);
    expect(os.userInfo().username.length).toBeGreaterThan(0);
  });
});
