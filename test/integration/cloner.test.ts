import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { loadConfig } from '../../server/config/index.js';
import { createCloner, CloneError } from '../../server/cloner/index.js';
import { buildInventory } from '../../server/cloner/inventory.js';
import { makeVulnRepo } from '../fixtures/make-vuln-repo.js';
import { tmpDirs } from '../helpers/tmp-dirs.js';

const td = tmpDirs();
afterEach(() => td.cleanup());
const fakeGh = path.resolve('test/fixtures/fake-gh.mjs');
const git = (cwd: string, ...a: string[]) => {
  const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', ...a], { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout.trim();
};

function setup(scenario: Record<string, unknown> = {}, env: Record<string, string> = {}) {
  const root = td.make();
  const fixture = makeVulnRepo(path.join(root, 'fixture'));
  git(fixture, 'checkout', '-q', '-b', 'feature');
  writeFileSync(path.join(fixture, 'feature.txt'), 'x');
  git(fixture, 'add', '-A');
  git(fixture, 'commit', '-q', '-m', 'feature');
  git(fixture, 'checkout', '-q', '-');
  symlinkSync('/etc/passwd', path.join(fixture, 'evil-link'));
  writeFileSync(path.join(fixture, 'blob.bin'), Buffer.from([1, 2, 0, 3, 4]));
  writeFileSync(path.join(fixture, 'app.min.js'), 'a'.repeat(3000));
  const data = path.join(root, 'data');
  mkdirSync(path.join(data, 'gh'), { recursive: true });
  writeFileSync(path.join(data, 'gh', '.fake-gh.json'), JSON.stringify({ fixtureDir: fixture, originUrl: fixture, ...scenario }));
  const config = loadConfig({ SCANNER_DATA_DIR: data, SCANNER_WORK_DIR: path.join(data, 'work'), SCANNER_GH_BIN: fakeGh, ...env });
  return { config, fixture, cloner: createCloner(config), logs: [] as string[] };
}
const repo = (ref: string | null = null) => ({ owner: 'o', name: 'r', fullName: 'o/r', ref });

describe('cloner', () => {
  it('clones into work/<id>, checks out ref, origin has no token', async () => {
    const s = setup();
    const r = await s.cloner.cloneRepo({ scanId: 'abc', repo: repo('feature'), signal: new AbortController().signal, onLog: (l) => s.logs.push(l) });
    expect(r.dir).toBe(path.join(s.config.workDir, 'abc'));
    expect(existsSync(path.join(r.dir, 'feature.txt'))).toBe(true);
    expect(r.commitSha).toMatch(/^[0-9a-f]{40}$/);
    expect(git(r.dir, 'remote', 'get-url', 'origin')).not.toMatch(/@|gh[po]_/);
    expect(readFileSync(path.join(s.config.dataDir, 'git', 'gitconfig'), 'utf8')).toContain('hooksPath = /dev/null');
    await s.cloner.removeClone('abc');
    expect(existsSync(r.dir)).toBe(false);
  });

  it('lists symlinks pointing outside the clone as ignored', async () => {
    const s = setup();
    const r = await s.cloner.cloneRepo({ scanId: 'sym', repo: repo(), signal: new AbortController().signal, onLog: () => undefined });
    expect(r.ignoredSymlinks).toEqual(['evil-link']);
  });

  it('unknown ref → ref_not_found and clone removed', async () => {
    const s = setup();
    await expect(s.cloner.cloneRepo({ scanId: 'r1', repo: repo('nope'), signal: new AbortController().signal, onLog: () => undefined }))
      .rejects.toMatchObject({ kind: 'ref_not_found' });
    expect(existsSync(path.join(s.config.workDir, 'r1'))).toBe(false);
  });

  it('size limit → too_large, clone removed', async () => {
    const s = setup({ cloneMode: 'huge', hugeBytes: 3 * 1024 * 1024 }, { SCANNER_MAX_REPO_MB: '1' });
    await expect(s.cloner.cloneRepo({ scanId: 'big', repo: repo(), signal: new AbortController().signal, onLog: () => undefined }))
      .rejects.toSatisfy((e: unknown) => e instanceof CloneError && e.kind === 'too_large');
    expect(existsSync(path.join(s.config.workDir, 'big'))).toBe(false);
  });

  it('timeout → timeout error, clone removed', async () => {
    const s = setup({ cloneMode: 'slow' }, { SCANNER_CLONE_TIMEOUT_S: '1' });
    await expect(s.cloner.cloneRepo({ scanId: 'slow', repo: repo(), signal: new AbortController().signal, onLog: () => undefined }))
      .rejects.toMatchObject({ kind: 'timeout' });
    expect(existsSync(path.join(s.config.workDir, 'slow'))).toBe(false);
  });

  it('not found / abort', async () => {
    const s = setup({ cloneError: 'GraphQL: Could not resolve to a Repository' });
    await expect(s.cloner.cloneRepo({ scanId: 'nf', repo: repo(), signal: new AbortController().signal, onLog: () => undefined }))
      .rejects.toMatchObject({ kind: 'not_found' });
    const ac = new AbortController(); ac.abort();
    await expect(s.cloner.cloneRepo({ scanId: 'ab', repo: repo(), signal: ac.signal, onLog: () => undefined }))
      .rejects.toMatchObject({ kind: 'cancelled' });
  });

  it('cleanupOrphans keeps listed ids', async () => {
    const s = setup();
    mkdirSync(path.join(s.config.workDir, 'keep'), { recursive: true });
    mkdirSync(path.join(s.config.workDir, 'orphan'), { recursive: true });
    expect(await s.cloner.cleanupOrphans(['keep'])).toBe(1);
    expect(existsSync(path.join(s.config.workDir, 'keep'))).toBe(true);
  });
});

describe('inventory', () => {
  it('detects manifests, binaries, minified, ci, install scripts, outside symlinks', async () => {
    const s = setup();
    symlinkSync('/etc/passwd', path.join(s.fixture, 'l2'));
    const inv = await buildInventory(s.fixture);
    const kind = (p: string) => inv.files.find((f) => f.path === p)?.kind;
    expect(inv.manifests).toContain('package.json');
    expect(inv.ciWorkflows).toEqual(['.github/workflows/pr.yml']);
    expect(inv.installScripts).toContain('package.json');
    expect(kind('blob.bin')).toBe('binary');
    expect(kind('app.min.js')).toBe('minified');
    expect(kind('l2')).toBe('symlink-outside');
    expect(inv.files.some((f) => f.path.startsWith('.git/'))).toBe(false);
  });
});
