import { randomUUID } from 'node:crypto';
import type { Scan, ScanStatus } from '../../shared/types.js';
import type { WsEvent } from '../../shared/ws.js';
import { createCloner } from '../cloner/index.js';
import type { Config } from '../config/index.js';
import type { Db } from '../db/index.js';
import { createRepos } from '../db/repos/index.js';
import type { Repos } from '../db/repos/index.js';
import { runScanPipeline, type PipelineInput, type ScanOutcome } from '../analysis/pipeline.js';
import { AppError } from '../api/errors.js';
import type { RepoRef } from '../repo-input/index.js';

export type Pipeline = (i: PipelineInput) => Promise<ScanOutcome>;
export type Cloner = ReturnType<typeof createCloner>;

export interface QueueDeps {
  config: Config; db: Db; broadcast(e: WsEvent): void;
  pipeline?: Pipeline; cloner?: Cloner; cancelTimeoutMs?: number;
}
export interface Queue {
  enqueue(r: RepoRef & { keepClone?: boolean }): Scan;
  cancel(id: string): Promise<Scan>;
  rescan(id: string): Scan;
  list(): { running: Scan[]; queued: Scan[] };
  position(id: string): number | null;
  positions(): Map<string, number>;
  recover(): Promise<number>;
  stop(): Promise<void>;
}

const TERMINAL: ScanStatus[] = ['done', 'failed', 'cancelled', 'budget_exceeded'];
const ACTIVE: ScanStatus[] = ['cloning', 'mapping', 'analyzing', 'synthesizing'];

export function createQueue(deps: QueueDeps): Queue {
  const { config, db, broadcast } = deps;
  const repos: Repos = createRepos(db);
  const cloner = deps.cloner ?? createCloner(config);
  const pipeline = deps.pipeline ?? runScanPipeline;
  const cancelTimeoutMs = deps.cancelTimeoutMs ?? 5000;
  const running = new Map<string, { ac: AbortController; done: Promise<void> }>();
  const cancelling = new Set<string>();
  let stopped = false;

  const positions = (): Map<string, number> => new Map(repos.scans.queued().map((s, i) => [s.id, i + 1]));
  const withPos = (s: Scan): Scan => ({ ...s, queuePosition: s.status === 'queued' ? (positions().get(s.id) ?? null) : null });
  const emitStatus = (id: string): Scan | null => {
    const s = repos.scans.get(id);
    if (s) broadcast({ type: 'scan.status', ts: new Date().toISOString(), data: { scan: withPos(s) } });
    return s;
  };
  const emitQueued = (): void => { for (const s of repos.scans.queued()) emitStatus(s.id); };

  const pump = (): void => {
    if (stopped) return;
    while (running.size < config.concurrency) {
      const next = repos.scans.queued()[0];
      if (!next) return;
      start(next);
    }
  };

  const start = (scan: Scan): void => {
    const ac = new AbortController();
    const started = repos.scans.update(scan.id, { status: 'cloning', startedAt: new Date().toISOString() })!;
    emitStatus(scan.id);
    emitQueued();
    const parsed = scan.repo.split('/');
    const repo: RepoRef = { owner: parsed[0] ?? '', name: parsed[1] ?? '', fullName: scan.repo, ref: scan.ref };
    const done = (async () => {
      try {
        const out = await pipeline({
          scan: started, config, deps: { repos, cloner }, signal: ac.signal, emit: broadcast,
        });
        const cur = repos.scans.get(scan.id);
        if (cur && !TERMINAL.includes(cur.status)) {
          repos.scans.update(scan.id, { status: out.status, failure: out.failure, finishedAt: new Date().toISOString() });
          emitStatus(scan.id);
        }
      } catch (e) {
        const cur = repos.scans.get(scan.id);
        if (cur && !TERMINAL.includes(cur.status)) {
          repos.scans.update(scan.id, {
            status: ac.signal.aborted ? 'cancelled' : 'failed',
            failure: ac.signal.aborted ? null : { code: 'internal', message: e instanceof Error ? e.message : String(e) },
            finishedAt: new Date().toISOString(),
          });
          emitStatus(scan.id);
        }
      } finally {
        running.delete(scan.id);
        void repo;
        pump();
      }
    })();
    running.set(scan.id, { ac, done });
  };

  return {
    enqueue(r) {
      const scan = repos.scans.create({ id: randomUUID(), repo: r.fullName, ref: r.ref, keepClone: r.keepClone ?? false });
      emitStatus(scan.id);
      pump();
      return withPos(repos.scans.get(scan.id)!);
    },
    async cancel(id) {
      const scan = repos.scans.get(id);
      if (!scan) throw new AppError('not_found', 404, 'Scan introuvable');
      if (TERMINAL.includes(scan.status)) throw new AppError('scan_not_cancellable', 409, 'Scan déjà terminé');
      const now = (): string => new Date().toISOString();
      if (scan.status === 'queued') {
        repos.scans.update(id, { status: 'cancelled', finishedAt: now() });
        emitStatus(id); emitQueued();
        return repos.scans.get(id)!;
      }
      const run = running.get(id);
      cancelling.add(id);
      try {
        run?.ac.abort();
        if (run) {
          await Promise.race([run.done, new Promise<void>((r) => setTimeout(r, cancelTimeoutMs - 500).unref())]);
        }
        await cloner.removeClone(id).catch(() => undefined);
        const cur = repos.scans.get(id)!;
        if (cur.status !== 'cancelled') {
          repos.scans.update(id, { status: 'cancelled', failure: null, finishedAt: now() });
          emitStatus(id);
        }
      } finally { cancelling.delete(id); }
      return repos.scans.get(id)!;
    },
    rescan(id) {
      const prev = repos.scans.get(id);
      if (!prev) throw new AppError('not_found', 404, 'Scan introuvable');
      const [owner = '', name = ''] = prev.repo.split('/');
      return this.enqueue({ owner, name, fullName: prev.repo, ref: prev.ref, keepClone: prev.keepClone });
    },
    list() {
      return { running: repos.scans.byStatus(ACTIVE), queued: repos.scans.queued().map(withPos) };
    },
    position: (id) => positions().get(id) ?? null,
    positions,
    async recover() {
      const stuck = repos.scans.byStatus(ACTIVE);
      for (const s of stuck) {
        repos.scans.update(s.id, { status: 'failed', failure: { code: 'interrupted', message: 'interrompu' }, finishedAt: new Date().toISOString() });
        emitStatus(s.id);
      }
      const queuedIds = repos.scans.queued().map((s) => s.id);
      await cloner.cleanupOrphans(queuedIds);
      pump();
      return stuck.length;
    },
    async stop() {
      stopped = true;
      for (const r of running.values()) r.ac.abort();
      await Promise.all([...running.values()].map((r) => r.done));
    },
  };
}
