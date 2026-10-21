import { lstat, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import type { Config } from '../config/index.js';
import { buildSubprocessEnv } from '../env-builder/index.js';
import { killTree, spawnTree } from '../proc/spawn.js';
import { redact } from '../redact/index.js';
import type { RepoRef } from '../repo-input/index.js';
import { writeGitConfig } from './gitconfig.js';
import { buildInventory } from './inventory.js';

export { buildInventory } from './inventory.js';
export type { Inventory, InventoryEntry } from './inventory.js';

export interface CloneResult { dir: string; commitSha: string; sizeBytes: number; ignoredSymlinks: string[] }
export type CloneErrorKind = 'gh_missing' | 'not_found' | 'auth_required' | 'ref_not_found' | 'too_large' | 'timeout'
  | 'cancelled' | 'unsafe_origin' | 'failed';
export class CloneError extends Error {
  constructor(public kind: CloneErrorKind, message: string) { super(message); this.name = 'CloneError'; }
}

async function dirSize(p: string): Promise<number> {
  let total = 0;
  let entries;
  try { entries = await readdir(p, { withFileTypes: true }); } catch { return 0; }
  for (const e of entries) {
    const a = path.join(p, e.name);
    if (e.isDirectory()) total += await dirSize(a);
    else { try { total += (await lstat(a)).size; } catch { /* vanished */ } }
  }
  return total;
}

interface Step { code: number | null; stdout: string; stderr: string }

export function createCloner(config: Config) {
  const cloneDir = (id: string): string => path.join(config.workDir, id);

  async function step(bin: string, args: string[], kind: 'gh' | 'git', dir: string, o: {
    scanId: string; cwd: string; signal: AbortSignal; onLog(l: string): void; watch: boolean;
  }): Promise<Step> {
    const env = buildSubprocessEnv(kind, { purpose: `scan.${o.scanId}.clone`, config });
    if (o.signal.aborted) throw new CloneError('cancelled', 'clone cancelled');
    const t = spawnTree(bin, args, { cwd: o.cwd, env, timeoutMs: config.cloneTimeoutS * 1000, signal: o.signal });
    let stdout = '', stderr = '', tooLarge = false;
    t.child.stdout?.on('data', (d: Buffer) => { stdout += d.toString('utf8'); });
    t.child.stderr?.on('data', (d: Buffer) => {
      const s = d.toString('utf8'); stderr += s;
      for (const l of s.split(/\r?\n/)) if (l.trim()) o.onLog(redact(l));
    });
    const limit = config.maxRepoMb * 1024 * 1024;
    let busy = false;
    const poll = o.watch ? setInterval(() => {
      if (busy || tooLarge) return;
      busy = true;
      void dirSize(dir).then((n) => { if (n > limit && !tooLarge) { tooLarge = true; void killTree(t.pid); } }).finally(() => { busy = false; });
    }, 1000) : undefined;
    const r = await t.done;
    if (poll) clearInterval(poll);
    if (tooLarge || (o.watch && (await dirSize(dir)) > limit)) throw new CloneError('too_large', `repository exceeds ${config.maxRepoMb} MB`);
    if (o.signal.aborted) throw new CloneError('cancelled', 'clone cancelled');
    if (r.timedOut) throw new CloneError('timeout', `clone exceeded ${config.cloneTimeoutS}s`);
    return { code: r.code, stdout: redact(stdout), stderr: redact(stderr) };
  }

  function classify(s: Step, hasRef: boolean): CloneError {
    const m = s.stderr;
    if (s.code === null) return new CloneError('gh_missing', 'gh executable could not be started');
    if (/auth|credential|401|403|sign in|login/i.test(m)) return new CloneError('auth_required', 'GitHub authentication required');
    if (hasRef && /couldn't find remote ref|not our ref|invalid ref|unknown revision|pathspec/i.test(m)) return new CloneError('ref_not_found', 'ref not found');
    if (/not found|could not resolve|404|does not exist|repository/i.test(m)) return new CloneError('not_found', 'repository not found');
    return new CloneError('failed', `clone failed: ${m.trim().split('\n').slice(-2).join(' ').slice(0, 300)}`);
  }

  async function removeClone(scanId: string): Promise<void> {
    await rm(cloneDir(scanId), { recursive: true, force: true });
  }

  async function cloneRepo(o: { scanId: string; repo: RepoRef; signal: AbortSignal; onLog(line: string): void }): Promise<CloneResult> {
    const dir = cloneDir(o.scanId);
    const ref = o.repo.ref;
    writeGitConfig(config);
    await mkdir(config.workDir, { recursive: true });
    await rm(dir, { recursive: true, force: true });
    const base = { scanId: o.scanId, signal: o.signal, onLog: o.onLog };
    try {
      const gh = await step(config.ghBin, ['repo', 'clone', o.repo.fullName, dir, '--', '--depth=1', '--no-tags'], 'gh', dir,
        { ...base, cwd: config.workDir, watch: true });
      if (gh.code !== 0) throw classify(gh, false);
      const git = (args: string[], watch = false) => step(config.gitBin, args, 'git', dir, { ...base, cwd: dir, watch });
      if (ref) {
        const f = await git(['fetch', '--depth=1', '--no-tags', 'origin', ref], true);
        if (f.code !== 0) throw classify(f, true);
        const c = await git(['-c', 'advice.detachedHead=false', 'checkout', '--detach', 'FETCH_HEAD']);
        if (c.code !== 0) throw classify(c, true);
      }
      const origin = await git(['remote', 'get-url', 'origin']);
      const url = origin.stdout.trim();
      if (origin.code !== 0 || /\/\/[^/@]*@/.test(url) || /gh[pousr]_|github_pat_|x-access-token/.test(url)) {
        throw new CloneError('unsafe_origin', 'remote origin is missing or embeds credentials');
      }
      const head = await git(['rev-parse', 'HEAD']);
      const commitSha = head.stdout.trim();
      if (head.code !== 0 || !/^[0-9a-f]{40,64}$/.test(commitSha)) throw new CloneError('failed', 'cannot resolve HEAD');
      const inv = await buildInventory(dir);
      return {
        dir, commitSha, sizeBytes: await dirSize(dir),
        ignoredSymlinks: inv.files.filter((f) => f.kind === 'symlink-outside').map((f) => f.path),
      };
    } catch (e) {
      await removeClone(o.scanId);
      throw e;
    }
  }

  /** Removes work-dir clones whose id is not in keepIds. Returns the number removed. */
  async function cleanupOrphans(keepIds: string[]): Promise<number> {
    let entries;
    try { entries = await readdir(config.workDir, { withFileTypes: true }); } catch { return 0; }
    const keep = new Set(keepIds);
    let n = 0;
    for (const e of entries) {
      if (keep.has(e.name)) continue;
      await rm(path.join(config.workDir, e.name), { recursive: true, force: true });
      n++;
    }
    return n;
  }

  return { cloneRepo, removeClone, cleanupOrphans };
}
