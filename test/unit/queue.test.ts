import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { openDb, type Db } from '../../server/db/index.js';
import { createRepos } from '../../server/db/repos/index.js';
import { loadConfig } from '../../server/config/index.js';
import { initRedaction } from '../../server/redact/index.js';
import { createCloner } from '../../server/cloner/index.js';
import { createQueue, type Pipeline } from '../../server/queue/index.js';
import { spawnTree } from '../../server/proc/spawn.js';
import type { WsEvent } from '../../shared/ws.js';
import { tmpDirs } from '../helpers/tmp-dirs.js';

const t = tmpDirs();
let db: Db; let dir: string; let events: WsEvent[];
const config = () => loadConfig({ SCANNER_DATA_DIR: dir, SCANNER_WORK_DIR: path.join(dir, 'work') });
const ref = (n: string) => ({ owner: 'o', name: n, fullName: `o/${n}`, ref: null });
const statuses = (id: string) => events.filter((e) => e.type === 'scan.status' && e.data.scan.id === id).map((e) => (e as any).data.scan);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (f: () => boolean) => { for (let i = 0; i < 200 && !f(); i++) await sleep(10); };

beforeEach(() => {
  dir = t.make(); mkdirSync(path.join(dir, 'work'), { recursive: true }); events = [];
  initRedaction({ dataDir: dir, workDir: path.join(dir, 'work'), hostname: 'h', username: 'u', homeDir: '/home/u' });
  db = openDb(path.join(dir, 'db.sqlite'));
});
afterEach(() => { db.close(); t.cleanup(); });

describe('queue', () => {
  it('runs scans FIFO with concurrency 1 and reports positions', async () => {
    const releases: (() => void)[] = [];
    const pipeline: Pipeline = (i) => new Promise((res) => releases.push(() => res({ status: 'done', failure: null })));
    const q = createQueue({ config: config(), db, broadcast: (e) => events.push(e), pipeline });
    const a = q.enqueue(ref('a')); const b = q.enqueue(ref('b'));
    expect(a.queuePosition).toBeNull();
    expect(b.queuePosition).toBe(1);
    expect(q.position(b.id)).toBe(1);
    expect(statuses(b.id)[0].queuePosition).toBe(1);
    expect(q.list().running.map((s) => s.id)).toEqual([a.id]);
    releases[0]!();
    await until(() => releases.length === 2);
    expect(q.position(b.id)).toBeNull();
    expect(createRepos(db).scans.get(b.id)!.status).toBe('cloning');
    releases[1]!();
    await until(() => createRepos(db).scans.get(b.id)!.status === 'done');
    expect(createRepos(db).scans.get(a.id)!.status).toBe('done');
    expect(statuses(b.id).map((s) => s.status)).toEqual(['queued', 'cloning', 'done']);
  });

  it('cancels a running scan in <5s: process killed by PID, clone removed', async () => {
    let pid = 0;
    const pipeline: Pipeline = async (i) => {
      mkdirSync(path.join(dir, 'work', i.scan.id), { recursive: true });
      const p = spawnTree('sleep', ['60'], { cwd: dir, env: { PATH: process.env.PATH ?? '' }, signal: i.signal });
      pid = p.pid; await p.done;
      return { status: 'cancelled', failure: null };
    };
    const cfg = config();
    const q = createQueue({ config: cfg, db, broadcast: (e) => events.push(e), pipeline, cloner: createCloner(cfg) });
    const a = q.enqueue(ref('a'));
    await until(() => pid > 0);
    const t0 = Date.now();
    const s = await q.cancel(a.id);
    expect(Date.now() - t0).toBeLessThan(5000);
    expect(s.status).toBe('cancelled');
    expect(existsSync(path.join(dir, 'work', a.id))).toBe(false);
    expect(() => process.kill(pid, 0)).toThrow();
    expect(statuses(a.id).at(-1).status).toBe('cancelled');
  });

  it('cancels a queued scan and rejects finished ones', async () => {
    const pipeline: Pipeline = () => new Promise(() => undefined);
    const q = createQueue({ config: config(), db, broadcast: (e) => events.push(e), pipeline });
    q.enqueue(ref('a')); const b = q.enqueue(ref('b'));
    expect((await q.cancel(b.id)).status).toBe('cancelled');
    await expect(q.cancel(b.id)).rejects.toMatchObject({ code: 'scan_not_cancellable' });
  });

  it('recover marks running scans failed "interrompu" and cleans clones', async () => {
    const repos = createRepos(db);
    const s = repos.scans.create({ id: 'run1', repo: 'o/a', ref: null, keepClone: false });
    repos.scans.update(s.id, { status: 'analyzing' });
    const keep = repos.scans.create({ id: 'q1', repo: 'o/b', ref: null, keepClone: false });
    mkdirSync(path.join(dir, 'work', 'run1')); mkdirSync(path.join(dir, 'work', 'stale'));
    mkdirSync(path.join(dir, 'work', keep.id));
    const cfg = config();
    const q = createQueue({ config: cfg, db, broadcast: (e) => events.push(e), pipeline: () => new Promise(() => undefined), cloner: createCloner(cfg) });
    expect(await q.recover()).toBe(1);
    const got = repos.scans.get('run1')!;
    expect(got.status).toBe('failed');
    expect(got.failure?.message).toBe('interrompu');
    expect(existsSync(path.join(dir, 'work', 'run1'))).toBe(false);
    expect(existsSync(path.join(dir, 'work', 'stale'))).toBe(false);
    expect(statuses('run1').at(-1).status).toBe('failed');
  });
});
