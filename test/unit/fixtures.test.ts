import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync, spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { tmpDirs } from '../helpers/tmp-dirs.js';
import { makeVulnRepo, fakeSecret } from '../fixtures/make-vuln-repo.js';
import { startEchoUpstream } from '../fixtures/echo-upstream.js';
import { findLeaks } from '../helpers/leak-check.js';

const t = tmpDirs();
afterEach(() => t.cleanup());
const claude = path.resolve('test/fixtures/fake-claude.mjs');
const gh = path.resolve('test/fixtures/fake-gh.mjs');

function runClaude(scenario: object, prompt: string, extraEnv: Record<string, string> = {}) {
  const home = t.make();
  writeFileSync(path.join(home, '.fake-claude.json'), JSON.stringify({ connect: false, ...scenario }));
  const r = spawnSync('node', [claude, '-p', '--output-format', 'stream-json', '--model', 'm'], { input: prompt, encoding: 'utf8', env: { PATH: process.env.PATH ?? '', HOME: home, ...extraEnv } });
  return { r, lines: r.stdout.split('\n').filter(Boolean).map((l) => JSON.parse(l)) };
}

describe('vuln repo', () => {
  it('is a real git repo with 4 flaws and no literal secret', () => {
    const dir = makeVulnRepo(t.make());
    expect(execFileSync('git', ['log', '--oneline'], { cwd: dir, encoding: 'utf8' })).toContain('fixture');
    expect(readFileSync(path.join(dir, 'src/config.js'), 'utf8')).toContain(fakeSecret());
    expect(readFileSync(path.join(dir, '.github/workflows/pr.yml'), 'utf8')).toContain('pull_request_target');
    expect(readFileSync(path.join(dir, 'package.json'), 'utf8')).toContain('| sh');
    expect(readFileSync(path.join(dir, 'README.md'), 'utf8')).toContain('IGNORE ALL PREVIOUS');
    const src = readFileSync(path.resolve('test/fixtures/make-vuln-repo.ts'), 'utf8');
    expect(src).not.toContain(fakeSecret());
  });
});

describe('fake-claude', () => {
  for (const scenario of ['success', 'forbidden-tool', 'outside-path', 'invalid-json', 'budget', 'injection']) {
    it(`emits valid stream-json: ${scenario}`, () => {
      const { r, lines } = runClaude({ scenario }, 'PASS: mapping\nhello');
      expect(r.status).toBe(0);
      expect(lines[0]).toMatchObject({ type: 'system', subtype: 'init' });
      expect(lines.some((l) => l.type === 'assistant' && l.message.content[0].type === 'tool_use')).toBe(true);
      expect(lines.some((l) => l.type === 'user' && l.message.content[0].type === 'tool_result')).toBe(true);
      const last = lines.at(-1);
      expect(last.type).toBe('result');
      expect(last.usage.input_tokens).toBeGreaterThan(0);
      expect(typeof last.total_cost_usd).toBe('number');
      if (scenario === 'forbidden-tool') expect(JSON.stringify(lines)).toContain('"name":"Bash"');
      if (scenario === 'outside-path') expect(JSON.stringify(lines)).toContain('/etc/passwd');
      if (scenario === 'budget') expect(last.total_cost_usd).toBeGreaterThan(10);
    });
  }
  it('uses PASS marker for output', () => {
    const { lines } = runClaude({ outputs: { synthesis: { verdict: 'caution' } } }, 'PASS: synthesis');
    expect(lines.at(-1).result).toContain('caution');
  });
  it('opens CONNECT via HTTPS_PROXY', async () => {
    const up = await startEchoUpstream();
    const seen: string[] = [];
    const net = await import('node:net');
    const proxy = net.createServer((c) => {
      c.once('data', (d) => {
        const first = d.toString().split('\r\n')[0]!;
        seen.push(first);
        c.write('HTTP/1.1 200 OK\r\n\r\n');
        const u = net.connect(up.port, '127.0.0.1');
        c.pipe(u); u.pipe(c);
        u.on('error', () => {}); c.on('error', () => {});
      });
    });
    await new Promise<void>((r) => proxy.listen(0, '127.0.0.1', r));
    const port = (proxy.address() as import('node:net').AddressInfo).port;
    const home = t.make();
    writeFileSync(path.join(home, '.fake-claude.json'), '{}');
    const child = spawn('node', [claude, '-p'], { env: { PATH: process.env.PATH ?? '', HOME: home, HTTPS_PROXY: `http://p:x@127.0.0.1:${port}` } });
    child.stdin.end('PASS: mapping');
    await new Promise((r) => child.on('close', r));
    proxy.close(); await up.close();
    expect(seen.some((s) => s.includes('api.anthropic.com:443'))).toBe(true);
    expect(seen.some((s) => s.includes('statsig.anthropic.com:443'))).toBe(true);
    expect(up.received().toString()).toContain('PING');
  });
});

describe('fake-gh', () => {
  it('prints device code and URL, then logs in', () => {
    const cfg = t.make();
    writeFileSync(path.join(cfg, '.fake-gh.json'), JSON.stringify({ loggedIn: false, loginDelayMs: 10 }));
    const env = { PATH: process.env.PATH ?? '', GH_CONFIG_DIR: cfg };
    expect(spawnSync('node', [gh, 'auth', 'status'], { env }).status).toBe(1);
    const r = spawnSync('node', [gh, 'auth', 'login'], { env, encoding: 'utf8' });
    expect(r.stdout).toContain('ABCD-1234');
    expect(r.stdout).toContain('https://github.com/login/device');
    expect(spawnSync('node', [gh, 'api', 'user'], { env, encoding: 'utf8' }).stdout).toContain('octocat');
    expect(spawnSync('node', [gh, 'auth', 'logout'], { env }).status).toBe(0);
    expect(spawnSync('node', [gh, 'auth', 'status'], { env }).status).toBe(1);
  });
  it('clones the fixture into a fresh git repo', () => {
    const cfg = t.make(); const fx = makeVulnRepo(t.make()); const dest = path.join(t.make(), 'clone');
    writeFileSync(path.join(cfg, '.fake-gh.json'), JSON.stringify({ fixtureDir: fx }));
    const r = spawnSync('node', [gh, 'repo', 'clone', 'o/n', dest], { env: { PATH: process.env.PATH ?? '', GH_CONFIG_DIR: cfg }, encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(existsSync(path.join(dest, '.git'))).toBe(true);
    expect(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dest, encoding: 'utf8' })).toMatch(/^[0-9a-f]{40}/);
  });
});

describe('leak-check', () => {
  it('detects forbidden strings', () => {
    const ctx = { dataDir: '/data-x', workDir: '/data-x/work' };
    expect(findLeaks('clean', ctx)).toEqual([]);
    expect(findLeaks('see /data-x/work/1', ctx)).toContain('/data-x');
  });
});
