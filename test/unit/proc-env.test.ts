import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadConfig } from '../../server/config/index.js';
import { buildEnv } from '../../server/env-builder/index.js';
import { spawnTree, killTree } from '../../server/proc/spawn.js';
import { runGh } from '../../server/gh/gh-cli.js';

const cfg = (extra: Record<string, string> = {}) => loadConfig({ SCANNER_DATA_DIR: '/tmp/d', ...extra });

describe('env-builder', () => {
  it('does not leak process.env', () => {
    process.env.HOST_SECRET = 'trap-value';
    for (const k of ['claude', 'gh', 'git'] as const) {
      const e = buildEnv(k, { purpose: 'app', config: cfg() });
      expect(JSON.stringify(e)).not.toContain('trap-value');
      expect(e.HOST_SECRET).toBeUndefined();
    }
    delete process.env.HOST_SECRET;
  });
  it('api key only when configured', () => {
    expect(buildEnv('claude', { purpose: 'p', config: cfg() }).ANTHROPIC_API_KEY).toBeUndefined();
    expect(buildEnv('claude', { purpose: 'p', config: cfg({ ANTHROPIC_API_KEY: 'sk-ant-abcdefgh1234' }) }).ANTHROPIC_API_KEY).toBe('sk-ant-abcdefgh1234');
    expect(buildEnv('claude', { purpose: 'p', config: cfg(), apiKey: 'sk-ant-zzzzzzzz9999' }).ANTHROPIC_API_KEY).toBe('sk-ant-zzzzzzzz9999');
  });
  it('always sets telemetry vars, proxy and homes', () => {
    const e = buildEnv('claude', { purpose: 'scan.1.claude.mapping', config: cfg() });
    expect(e).toMatchObject({ DISABLE_TELEMETRY: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', DO_NOT_TRACK: '1',
      NPM_CONFIG_UPDATE_NOTIFIER: 'false', HOME: '/tmp/d/claude-home' });
    expect(e.HTTPS_PROXY).toBe('http://scan.1.claude.mapping:x@127.0.0.1:3128');
    const g = buildEnv('gh', { purpose: 'github', config: cfg() });
    expect(g).toMatchObject({ GH_TELEMETRY: '0', GH_CONFIG_DIR: '/tmp/d/gh', BROWSER: 'true', GH_PROMPT_DISABLED: '1' });
    expect(buildEnv('gh-login', { purpose: 'x', config: cfg() }).GH_PROMPT_DISABLED).toBeUndefined();
  });
});

describe('proc', () => {
  it('killTree kills parent and child by pid in <1s', async () => {
    const t = spawnTree('sh', ['-c', 'sleep 60 & echo $!; wait'], { cwd: '/tmp', env: { PATH: process.env.PATH ?? '' } });
    const childPid = await new Promise<number>((res) => t.child.stdout!.once('data', (d) => res(Number(String(d).trim()))));
    const t0 = Date.now();
    await killTree(t.pid);
    await t.done;
    expect(Date.now() - t0).toBeLessThan(1000);
    await new Promise((r) => setTimeout(r, 50));
    // a reparented orphan may linger as an unreaped zombie when PID 1 does not reap
    const state = (() => { try { return readFileSync(`/proc/${childPid}/stat`, 'utf8').split(') ')[1]?.[0]; } catch { return undefined; } })();
    expect(state === undefined || state === 'Z').toBe(true);
  });
  it('timeout flags timedOut; .mjs runs via node; runGh uses ghBin', async () => {
    const t = spawnTree('sleep', ['30'], { cwd: '/tmp', env: { PATH: process.env.PATH ?? '' }, timeoutMs: 100 });
    expect((await t.done).timedOut).toBe(true);
    const dir = mkdtempSync(path.join(tmpdir(), 'gh-'));
    const bin = path.join(dir, 'fakegh.mjs');
    writeFileSync(bin, 'console.log("args=" + process.argv.slice(2).join(",") + " tel=" + process.env.GH_TELEMETRY + " leak=" + process.env.HOST_SECRET)');
    process.env.HOST_SECRET = 'trap';
    const r = await runGh(['auth', 'status'], { purpose: 'github', config: cfg({ SCANNER_GH_BIN: bin, SCANNER_DATA_DIR: dir }) });
    delete process.env.HOST_SECRET;
    expect(r.stdout.trim()).toBe('args=auth,status tel=0 leak=undefined');
  });
});
