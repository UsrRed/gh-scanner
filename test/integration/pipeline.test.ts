import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../../server/config/index.js';
import { createCloner } from '../../server/cloner/index.js';
import { initClaudeRunner } from '../../server/claude-runner/index.js';
import { openDb } from '../../server/db/index.js';
import { createRepos } from '../../server/db/repos/index.js';
import { initRedaction } from '../../server/redact/index.js';
import { runScanPipeline } from '../../server/analysis/pipeline.js';
import type { WsEvent } from '../../shared/ws.js';
import { fakeSecret, makeVulnRepo } from '../fixtures/make-vuln-repo.js';
import { tmpDirs } from '../helpers/tmp-dirs.js';

const td = tmpDirs();
afterEach(() => td.cleanup());

const MAPPING = { languages: ['js'], entryPoints: [], manifests: ['package.json'], lockfiles: [], ciWorkflows: ['.github/workflows/pr.yml'],
  installScripts: ['package.json'], riskZones: [{ path: 'src/config.js', reason: 'secrets', categories: ['secrets'] }] };
const TARGETED = { findings: [{ severity: 'medium', category: 'quality', rule: 'weak-config', title: 'Weak config', file: 'src/config.js', line: 1,
  explanation: 'x', fix: 'y' }] };
const SYNTHESIS = { verdict: 'do-not-install', justification: 'Secret, postinstall and CI risks.', keyRisks: ['secret'] };

function setup(claude: object, env: Record<string, string> = {}) {
  const root = td.make();
  const fixture = makeVulnRepo(path.join(root, 'fixture'));
  const data = path.join(root, 'data');
  mkdirSync(path.join(data, 'gh'), { recursive: true });
  mkdirSync(path.join(data, 'claude-home'), { recursive: true });
  writeFileSync(path.join(data, 'gh', '.fake-gh.json'), JSON.stringify({ fixtureDir: fixture, originUrl: fixture }));
  writeFileSync(path.join(data, 'claude-home', '.fake-claude.json'),
    JSON.stringify({ connect: false, outputs: { mapping: MAPPING, targeted: TARGETED, synthesis: SYNTHESIS }, ...claude }));
  const config = loadConfig({ SCANNER_DATA_DIR: data, SCANNER_WORK_DIR: path.join(data, 'work'),
    SCANNER_GH_BIN: path.resolve('test/fixtures/fake-gh.mjs'), SCANNER_CLAUDE_BIN: path.resolve('test/fixtures/fake-claude.mjs'), ...env });
  initRedaction({ dataDir: data, workDir: config.workDir, hostname: 'h', username: 'u', homeDir: '/nonexistent' });
  initClaudeRunner(config);
  const db = openDb(path.join(data, 'scanner.db'));
  const repos = createRepos(db);
  const scan = repos.scans.create({ id: 'scan1', repo: 'o/r', ref: null, keepClone: false });
  const events: WsEvent[] = [];
  const run = () => runScanPipeline({ scan, config, deps: { repos, cloner: createCloner(config) }, signal: new AbortController().signal, emit: (e) => events.push(e) });
  return { config, repos, run, events, db };
}

describe('runScanPipeline', () => {
  it('full scan on fixture: findings, persistence, clone removed', async () => {
    const s = setup({});
    const out = await s.run();
    expect(out).toEqual({ status: 'done', failure: null });
    const scan = s.repos.scans.get('scan1')!;
    expect(scan.status).toBe('done');
    expect(scan.claudeVerdict).toBe('do-not-install');
    expect(scan.commitSha).toMatch(/^[0-9a-f]{40}$/);
    expect(scan.usage.inputTokens).toBeGreaterThan(0);
    const fs = s.repos.findings.listByScan('scan1');
    const secret = fs.find((f) => f.category === 'secrets' && f.severity === 'critical');
    expect(secret).toBeTruthy();
    expect(secret!.snippet).not.toContain(fakeSecret());
    expect(JSON.stringify(fs)).not.toContain(fakeSecret());
    expect(fs.some((f) => f.rule.includes('pull-request-target') || f.title.toLowerCase().includes('pull_request_target'))).toBe(true);
    expect(fs.some((f) => f.category === 'install-scripts')).toBe(true);
    expect(fs.some((f) => f.category === 'prompt-injection')).toBe(true);
    expect(fs.filter((f) => f.rule === 'weak-config')).toHaveLength(1);
    expect(fs.find((f) => f.rule === 'weak-config')!.source).toBe('claude');
    expect(fs.find((f) => f.rule === 'weak-config')!.snippet).toContain('awsKey');
    expect(scan.score).toBeLessThan(100);
    // persistence
    const sessions = s.repos.claudeSessions.listByScan('scan1');
    expect(sessions.map((x) => x.pass)).toEqual(['mapping', ...Array(5).fill('targeted'), 'synthesis']);
    expect(sessions.every((x) => x.status === 'ok' && x.promptBytes > 0 && x.usage.inputTokens > 0)).toBe(true);
    expect(sessions[0]!.model).toBe(s.config.modelAnalysis);
    expect(sessions.at(-1)!.model).toBe(s.config.modelSynthesis);
    const reads = s.repos.outbound.listByScan('scan1');
    expect(reads.length).toBeGreaterThanOrEqual(14);
    expect(reads.some((r) => r.tool === 'Read' && r.path === 'README.md' && r.bytes > 0)).toBe(true);
    expect(reads.some((r) => r.tool === 'Glob' && r.pattern === '**/*')).toBe(true);
    // events
    expect(s.events.some((e) => e.type === 'scan.usage')).toBe(true);
    expect(s.events.some((e) => e.type === 'scan.step')).toBe(true);
    expect(s.events.filter((e) => e.type === 'scan.status').map((e) => (e as { data: { scan: { status: string } } }).data.scan.status))
      .toEqual(expect.arrayContaining(['cloning', 'mapping', 'analyzing', 'synthesizing', 'done']));
    expect(existsSync(path.join(s.config.workDir, 'scan1'))).toBe(false);
  });

  it('budget exceeded: partial report, no further pass', async () => {
    const s = setup({ scenario: 'budget' });
    const out = await s.run();
    expect(out.status).toBe('budget_exceeded');
    const scan = s.repos.scans.get('scan1')!;
    expect(scan.status).toBe('budget_exceeded');
    expect(s.repos.scans.meta('scan1')!.partial).toBe(true);
    expect(scan.claudeVerdict).toBeNull();
    const sessions = s.repos.claudeSessions.listByScan('scan1');
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.status).toBe('budget_exceeded');
    expect(s.repos.findings.listByScan('scan1').some((f) => f.category === 'secrets')).toBe(true);
    expect(existsSync(path.join(s.config.workDir, 'scan1'))).toBe(false);
  });

  it('forbidden tool: sandbox-violation finding', async () => {
    const s = setup({ scenario: 'forbidden-tool' });
    const out = await s.run();
    expect(out.status).toBe('done');
    const fs = s.repos.findings.listByScan('scan1');
    expect(fs.some((f) => f.category === 'sandbox-violation')).toBe(true);
    expect(s.repos.claudeSessions.listByScan('scan1').some((x) => x.status === 'killed')).toBe(true);
    expect(s.repos.scans.meta('scan1')!.partial).toBe(true);
  });

  it('keeps the clone when requested', async () => {
    const s = setup({}, { SCANNER_KEEP_CLONES: '1' });
    await s.run();
    expect(existsSync(path.join(s.config.workDir, 'scan1'))).toBe(true);
  });
});
